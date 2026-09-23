// Apple Ads (Search Ads) keyword popularity + recommendations via the signed-in web session.
// This is the private API the ads.apple.com dashboard uses; it is unofficial and may change.
import { CliError, loadConfig, loadSession } from '../config.js';
import { storefront } from '../storefronts.js';

const BASE = 'https://app-ads.apple.com/cm/api/v2/keywords';
const BATCH = 100;
const MIN_INTERVAL_MS = 1000;
let lastRequest = 0;

export const authRequired = (message = 'Apple Ads sign-in required') =>
  new CliError('AUTH_REQUIRED', message, { hint: 'Run `aso login` (or `aso setup` the first time)', exitCode: 3 });

export function requireSession() {
  const session = loadSession();
  if (!session?.cookieHeader) throw authRequired();
  const appId = loadConfig().appId || session.appId;
  if (!appId) {
    throw new CliError('APP_ID_REQUIRED', 'No app configured for Apple Ads requests',
      { hint: 'Run `aso config appId <your App Store app id>`', exitCode: 2 });
  }
  return { ...session, appId };
}

async function post(path, params, body, session) {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  for (let attempt = 1; ; attempt++) {
    lastRequest = Date.now();
    const q = new URLSearchParams({ adamId: session.appId, ...params });
    let res;
    try {
      res = await fetch(`${BASE}/${path}?${q}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: 'https://app-ads.apple.com',
          Cookie: session.cookieHeader,
          ...(session.xsrfToken ? { 'X-XSRF-TOKEN': session.xsrfToken } : {}),
          ...(session.orgId ? { 'X-AP-Context': `orgId=${session.orgId}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      if (attempt < 3) { await new Promise((r) => setTimeout(r, 1500 * attempt)); continue; }
      throw new CliError('APPLE_ADS_UNAVAILABLE', `Apple Ads request failed: ${e.message}`);
    }
    const text = await res.text();
    if (process.env.ASO_DEBUG) process.stderr.write(`aso: debug ${path} HTTP ${res.status} ${text.slice(0, 200).replace(/\s+/g, ' ')}\n`);
    let data = null;
    try { data = JSON.parse(text); } catch { /* HTML error page */ }
    // An expired session shows up as 401/403, or as an HTML 503 page instead of JSON.
    if (res.status === 401 || res.status === 403 || (!data && res.status >= 300)) {
      if (res.status === 403 && data?.error?.errors?.[0]?.messageCode === 'KWS_NO_ORG_CONTENT_PROVIDERS' && attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }
      throw authRequired('Apple Ads session expired or not authorized');
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 3) { await new Promise((r) => setTimeout(r, 5000 * attempt)); continue; }
      throw new CliError('APPLE_ADS_RATE_LIMITED', `Apple Ads returned HTTP ${res.status}`, { hint: 'Wait a few minutes and retry' });
    }
    if (!res.ok || data?.status !== 'success' || !Array.isArray(data.data)) {
      const msg = data?.error?.errors?.[0]?.message || `HTTP ${res.status}`;
      throw new CliError('APPLE_ADS_ERROR', `Apple Ads error: ${msg}`, {
        hint: 'Check that your Apple Ads account is linked to App Store Connect and `aso config appId` is an app you own',
      });
    }
    return data.data;
  }
}

function adsCountry(country) {
  const s = storefront(country);
  if (!s?.ads) throw new CliError('NO_ADS_STOREFRONT', `Apple Ads popularity is not available for ${country}`);
  return s.code;
}

// Returns Map(lowercased keyword -> popularity 5..100).
export async function popularity(terms, country, session = requireSession()) {
  const cc = adsCountry(country);
  const out = new Map();
  for (let i = 0; i < terms.length; i += BATCH) {
    const rows = await post('popularities', {}, { storefronts: [cc], terms: terms.slice(i, i + BATCH) }, session);
    for (const r of rows) if (typeof r.popularity === 'number') out.set(String(r.name).toLowerCase(), r.popularity);
  }
  return out;
}

// Apple Ads keyword recommendations for a seed, with popularity.
export async function recommendations(seed, country, session = requireSession()) {
  const cc = adsCountry(country);
  const rows = await post('recommendation', { text: seed }, { storefronts: [cc] }, session);
  return rows.map((r) => ({ keyword: r.name, popularity: r.popularity ?? null }));
}
