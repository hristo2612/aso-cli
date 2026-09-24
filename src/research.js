import { loadConfig, loadSession } from './config.js';
import { getPassword } from './keychain.js';
import { popularity, recommendations, requireSession } from './apple/ads.js';
import { searchResults, rankOf, hints } from './apple/store.js';
import { difficulty, opportunity, keywordMatch, confidence, isBrandKeyword } from './difficulty.js';
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
    if (!['AUTH_REQUIRED', 'ADS_ORG_NOT_LINKED'].includes(e.code) || reloggedIn || !allowLogin) throw e;
    const config = loadConfig();
    if (!config.autoLogin || !config.appleId || !(await getPassword(config.keychainService, config.appleId))) throw e;
    reloggedIn = true;
    say(e.code === 'AUTH_REQUIRED' ? 'Apple Ads session expired, signing in again' : 'Apple Ads org has no linked apps, re-detecting');
    const { login } = await import('./login.js');
    // Trusted browser profiles usually sign in without any prompt, so try invisibly first.
    try {
      await login({ headless: true, timeoutSec: 60 });
    } catch (err) {
      if (!['NEEDS_INTERACTION', 'LOGIN_TIMEOUT'].includes(err.code)) throw err;
      say('Apple needs you for a moment, opening Chrome');
      await login({ timeoutSec: 240 });
    }
    return fn(requireSession());
  }
}

export async function analyzeKeywords(terms, { country, appId, platform = 'iphone', fresh = false, allowLogin = true, record = true, minPopularity = null, maxDifficulty = null } = {}) {
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
  const filteredOut = [];
  const kept = terms.filter((t) => {
    const pop = pops.get(t);
    if (minPopularity != null && pop != null && pop < minPopularity) {
      filteredOut.push({ keyword: t, reason: 'below_min_popularity', popularity: pop });
      return false;
    }
    return true;
  });
  const analyzed = await mapLimit(kept, 2, async (keyword) => {
    let results;
    let hintCount = 0;
    try {
      [results, hintCount] = await Promise.all([
        searchResults(keyword, country, { platform }),
        hints(keyword, country).then((h) => h.length, () => 0),
      ]);
    } catch (e) {
      warnings.push(`${keyword}: App Store search failed (${e.message})`);
      results = null;
    }
    const pop = pops.get(keyword) ?? null;
    const diff = !results ? null
      : results.complete && results.appCount === 0 ? 0 // nothing to compete with
        : results.apps.length >= 3 ? difficulty(results.apps, { popularity: pop, hintCount }) : null;
    const rank = results && appId ? rankOf(results, appId) : null;
    // 'unknown' when the search failed or only a partial list came back and the app wasn't in it.
    const rankStatus = !appId ? undefined : rank != null ? 'ranked' : results?.complete ? 'not_in_results' : 'unknown';
    const topApps = (results?.apps ?? []).slice(0, 5).map((a) => ({
      rank: a.rank, id: a.id, name: a.name, subtitle: a.subtitle, developer: a.developer,
      rating: a.rating, ratingCount: a.ratingCount, updatedAt: a.updatedAt, match: keywordMatch(keyword, a.name, a.subtitle),
    }));
    if (record && results) {
      recordKeyword({ keyword, country, platform, observedAt, popularity: pop, difficulty: diff, appCount: results.appCount, topApps });
      if (appId && rankStatus !== 'unknown') recordRank({ appId: String(appId), keyword, country, platform, observedAt, rank });
    }
    return {
      keyword,
      popularity: pop,
      popularityFloor: pop === 5,
      difficulty: diff,
      opportunity: opportunity(pop, diff),
      confidence: results ? confidence(results.appCount, pop) : 'low',
      brand: results ? isBrandKeyword(keyword, results.apps) : false,
      appCount: results?.appCount ?? null,
      ...(appId ? { rank, rankStatus, rankDepth: results?.depth ?? null } : {}),
      topApps,
    };
  });
  const items = analyzed.filter((i) => {
    if (maxDifficulty != null && i.difficulty != null && i.difficulty > maxDifficulty) {
      filteredOut.push({ keyword: i.keyword, reason: 'above_max_difficulty', difficulty: i.difficulty });
      return false;
    }
    return true;
  });
  return { country, platform, appId: appId ? String(appId) : null, observedAt, items, filteredOut, warnings };
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
  // Apple mixes in terms from other languages; keep the seed's script (Latin seed -> Latin results).
  const latin = (t) => !/[^\p{Script=Latin}\p{N}\p{P}\p{Zs}]/u.test(t);
  const sameScript = latin(seed) ? latin : () => true;
  const items = [...byKeyword.values()].filter((i) => sameScript(i.keyword))
    .sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1))
    .slice(0, limit);
  return { seed, country, items, warnings };
}
