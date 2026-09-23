// Public App Store data (no login needed): search order, app details, autocomplete.
import { CliError } from '../config.js';
import { storefront } from '../storefronts.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const MAX_RESULTS = 200;

async function get(url, { headers = {}, json = false, attempts = 3 } = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(20000) });
      if (res.status === 404) return null;
      if (res.ok) return json ? res.json() : res.text();
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, 500 * i * i));
  }
  const offline = /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|fetch failed/i.test(`${lastError?.cause?.code} ${lastError?.message}`);
  throw new CliError(offline ? 'NETWORK_ERROR' : 'APP_STORE_UNAVAILABLE',
    offline ? 'Could not reach the App Store (are you offline?)' : `The App Store did not respond (${lastError?.message})`,
    { hint: offline ? 'Check your internet connection and retry' : 'Apple may be having issues; retry in a minute' });
}

function sf(country) {
  const s = storefront(country);
  if (!s) throw new CliError('BAD_COUNTRY', `Unknown country "${country}"`, { hint: 'Run `aso storefronts`', exitCode: 2 });
  return s;
}

// App Store web pages embed their data as JSON in <script id="serialized-server-data">.
export function serializedData(html) {
  const m = html?.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1])?.data?.[0]?.data ?? null;
  } catch {
    return null;
  }
}

// "208K" -> 208000, "1.2M" -> 1200000.
export function parseCount(value) {
  if (typeof value === 'number') return value;
  const m = String(value ?? '').trim().match(/^([\d.,]+)\s*([KkMm]?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Math.round(n * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1));
}

// Top results in true App Store order, with subtitles (usually ~10-12 apps).
export async function searchPage(term, country) {
  const { code } = sf(country);
  const html = await get(`https://apps.apple.com/${code.toLowerCase()}/iphone/search?term=${encodeURIComponent(term)}`);
  const data = serializedData(html);
  const apps = [];
  for (const shelf of data?.shelves ?? []) {
    for (const item of shelf.items ?? []) {
      const l = item.lockup;
      if (!l?.adamId || apps.some((a) => a.id === String(l.adamId))) continue;
      apps.push({
        id: String(l.adamId),
        name: l.title ?? null,
        subtitle: l.subtitle ?? null,
        developer: l.developerName ?? null,
        rating: l.rating ?? null,
        ratingCount: parseCount(l.ratingCount),
      });
    }
  }
  return apps;
}

function fromItunes(r) {
  return {
    id: String(r.trackId),
    name: r.trackName,
    subtitle: null,
    developer: r.artistName ?? r.sellerName ?? null,
    rating: r.averageUserRating ?? null,
    ratingCount: r.userRatingCount ?? 0,
    releasedAt: r.releaseDate ?? null,
    updatedAt: r.currentVersionReleaseDate ?? null,
    version: r.version ?? null,
    genre: r.primaryGenreName ?? null,
    price: r.formattedPrice ?? null,
    bundleId: r.bundleId ?? null,
    url: r.trackViewUrl ?? null,
  };
}

export async function itunesSearch(term, country, limit = MAX_RESULTS) {
  const { code } = sf(country);
  const q = new URLSearchParams({ term, country: code, entity: 'software', limit: String(limit) });
  const data = await get(`https://itunes.apple.com/search?${q}`, { json: true });
  return (data?.results ?? []).filter((r) => r.trackId).map(fromItunes);
}

export async function lookup(ids, country) {
  if (!ids.length) return [];
  const { code } = sf(country);
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const q = new URLSearchParams({ id: ids.slice(i, i + 100).join(','), country: code, entity: 'software' });
    const data = await get(`https://itunes.apple.com/lookup?${q}`, { json: true });
    for (const r of data?.results ?? []) if (r.trackId) out.push({ ...fromItunes(r), raw: r });
  }
  return out;
}

// Full ranked result list for a term: web-page order first (true ranking + subtitles),
// then the deeper iTunes Search order. Details are merged by app id.
export async function searchResults(term, country, { limit = MAX_RESULTS } = {}) {
  const [top, deep] = await Promise.all([
    searchPage(term, country).catch(() => []),
    itunesSearch(term, country),
  ]);
  const byId = new Map(deep.map((a) => [a.id, a]));
  const order = [...top.map((a) => a.id), ...deep.map((a) => a.id).filter((id) => !top.some((a) => a.id === id))];
  const missing = top.filter((a) => !byId.has(a.id)).map((a) => a.id);
  for (const a of await lookup(missing, country).catch(() => [])) byId.set(a.id, a);
  const apps = order.slice(0, limit).map((id, i) => {
    const web = top.find((a) => a.id === id) ?? {};
    const it = byId.get(id) ?? {};
    const { raw, ...details } = it;
    return {
      rank: i + 1,
      ...details,
      id,
      name: web.name ?? it.name ?? null,
      subtitle: web.subtitle ?? null,
      developer: it.developer ?? web.developer ?? null,
      rating: it.rating ?? web.rating ?? null,
      ratingCount: it.ratingCount ?? web.ratingCount ?? 0,
    };
  });
  return { apps, appCount: order.length, topSource: top.length ? 'app-store-web' : 'itunes-search' };
}

// Rank of `appId` for a term, or null when outside the top results.
export function rankOf(results, appId) {
  return results.apps.find((a) => a.id === String(appId))?.rank ?? null;
}

// App Store autocomplete suggestions.
export async function hints(term, country) {
  const { id } = sf(country);
  const xml = await get(
    `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(term)}`,
    { headers: { 'X-Apple-Store-Front': `${id}-1,29` } }
  );
  return [...(xml ?? '').matchAll(/<key>term<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => decodeXml(m[1]));
}

function decodeXml(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Full public listing: iTunes lookup + product page (subtitle, exact ratings, languages).
export async function appDetails(appId, country, lang) {
  const { code } = sf(country);
  const [it] = await lookup([String(appId)], country);
  if (!it) throw new CliError('APP_NOT_FOUND', `App ${appId} is not in the ${code} App Store`, { hint: 'Use the number after /id in the App Store URL, or try another country with -c', exitCode: 2 });
  const url = `https://apps.apple.com/${code.toLowerCase()}/app/id${appId}${lang ? `?l=${encodeURIComponent(lang)}` : ''}`;
  const page = serializedData(await get(url).catch(() => null));
  const lockup = page?.lockup ?? {};
  const ratings = page?.shelfMapping?.productRatings?.items?.[0] ?? {};
  const r = it.raw;
  return {
    id: it.id,
    name: lockup.title ?? it.name,
    subtitle: lockup.subtitle ?? null,
    developer: it.developer,
    developerId: r.artistId ? String(r.artistId) : null,
    bundleId: it.bundleId,
    rating: ratings.ratingAverage ?? it.rating,
    ratingCount: ratings.totalNumberOfRatings ?? it.ratingCount,
    ratingHistogram: ratings.ratingCounts ?? null,
    version: it.version,
    releasedAt: it.releasedAt,
    updatedAt: it.updatedAt,
    releaseNotes: r.releaseNotes ?? null,
    genres: r.genres ?? [],
    price: it.price,
    contentRating: r.trackContentRating ?? null,
    languages: r.languageCodesISO2A ?? [],
    screenshots: { iphone: r.screenshotUrls?.length ?? 0, ipad: r.ipadScreenshotUrls?.length ?? 0 },
    sizeMB: r.fileSizeBytes ? Math.round(Number(r.fileSizeBytes) / 1e6) : null,
    description: r.description ?? null,
    url: it.url,
    icon: r.artworkUrl512 ?? null,
  };
}
