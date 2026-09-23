import { loadConfig, loadSession } from './config.js';
import { getPassword } from './keychain.js';
import { popularity, recommendations, requireSession } from './apple/ads.js';
import { searchResults, rankOf, hints } from './apple/store.js';
import { difficulty, opportunity, keywordMatch } from './difficulty.js';
import { cachedPopularity, recordKeyword, recordRank, now } from './db.js';

const say = (msg) => process.stderr.write(`aso: ${msg}\n`);
const UNFLOOR_LIMIT = 25;

export function parseTerms(args) {
  const seen = new Set();
  return args.flatMap((a) => String(a).split(','))
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((t) => t && !seen.has(t) && seen.add(t));
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// Runs an Apple Ads call; on an expired session, signs in again once (if allowed) and retries.
let reloggedIn = false;
export async function withAppleAds(fn, { allowLogin = true } = {}) {
  try {
    return await fn(requireSession());
  } catch (e) {
    if (e.code !== 'AUTH_REQUIRED' || reloggedIn || !allowLogin) throw e;
    const config = loadConfig();
    if (!config.autoLogin || !config.appleId || !(await getPassword(config.keychainService, config.appleId))) throw e;
    reloggedIn = true;
    say('Apple Ads session expired — signing in again');
    const { login } = await import('./login.js');
    await login({ timeoutSec: 240 });
    return fn(requireSession());
  }
}

export async function analyzeKeywords(terms, { country, appId, fresh = false, allowLogin = true, record = true } = {}) {
  const warnings = [];
  const pops = new Map();
  const needed = fresh ? terms : terms.filter((t) => {
    const cached = cachedPopularity(t, country);
    if (cached != null) pops.set(t, cached);
    return cached == null;
  });

  if (needed.length) {
    if (!loadSession() && !allowLogin) {
      warnings.push('No Apple Ads session: popularity is null. Run `aso login` to enable it.');
    } else {
      try {
        const live = await withAppleAds((s) => popularity(needed, country, s), { allowLogin });
        for (const t of needed) pops.set(t, live.get(t) ?? null);
        // The batch endpoint reports low-volume terms as 5. Seeding recommendations with the exact
        // term often returns its real (un-floored) value, at one request per term.
        const floored = needed.filter((t) => pops.get(t) === 5).slice(0, UNFLOOR_LIMIT);
        for (const t of floored) {
          const echo = (await withAppleAds((s) => recommendations(t, country, s), { allowLogin }))
            .find((r) => r.keyword.toLowerCase() === t);
          if (echo?.popularity > 5) pops.set(t, echo.popularity);
        }
      } catch (e) {
        warnings.push(`Popularity unavailable: ${e.message}${e.hint ? ` (${e.hint})` : ''}`);
      }
    }
  }

  const observedAt = now();
  const items = await mapLimit(terms, 4, async (keyword) => {
    let results;
    try {
      results = await searchResults(keyword, country);
    } catch (e) {
      warnings.push(`${keyword}: search failed (${e.message})`);
      results = null;
    }
    const pop = pops.get(keyword) ?? null;
    const diff = results ? difficulty(keyword, results.apps, results.appCount) : null;
    const rank = results && appId ? rankOf(results, appId) : null;
    const topApps = (results?.apps ?? []).slice(0, 5).map((a) => ({
      rank: a.rank, id: a.id, name: a.name, subtitle: a.subtitle, developer: a.developer,
      rating: a.rating, ratingCount: a.ratingCount, updatedAt: a.updatedAt, match: keywordMatch(keyword, a.name, a.subtitle),
    }));
    if (record && results) {
      recordKeyword({ keyword, country, observedAt, popularity: pop, difficulty: diff, appCount: results.appCount, topApps });
      if (appId) recordRank({ appId: String(appId), keyword, country, observedAt, rank });
    }
    return {
      keyword,
      popularity: pop,
      popularityFloor: pop === 5,
      difficulty: diff,
      opportunity: opportunity(pop, diff),
      appCount: results?.appCount ?? null,
      ...(appId ? { rank } : {}),
      topApps,
    };
  });
  return { country, appId: appId ? String(appId) : null, observedAt, items, warnings };
}

export async function suggest(seed, { country, limit = 50, allowLogin = true } = {}) {
  const warnings = [];
  let apple = [];
  try {
    apple = await withAppleAds((s) => recommendations(seed, country, s), { allowLogin });
  } catch (e) {
    warnings.push(`Apple Ads recommendations unavailable: ${e.message}`);
  }
  let auto = [];
  try {
    const prefixes = [seed, ...seed.split(' ').length === 1 ? [`${seed} `] : []];
    auto = [...new Set((await Promise.all(prefixes.map((p) => hints(p, country)))).flat())];
  } catch (e) {
    warnings.push(`App Store autocomplete unavailable: ${e.message}`);
  }
  const byKeyword = new Map();
  for (const r of apple) byKeyword.set(r.keyword.toLowerCase(), { keyword: r.keyword.toLowerCase(), popularity: r.popularity, sources: ['apple-ads'] });
  for (const h of auto) {
    const k = h.toLowerCase();
    if (byKeyword.has(k)) byKeyword.get(k).sources.push('autocomplete');
    else byKeyword.set(k, { keyword: k, popularity: null, sources: ['autocomplete'] });
  }
  const items = [...byKeyword.values()]
    .sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1))
    .slice(0, limit);
  return { seed, country, items, warnings };
}
