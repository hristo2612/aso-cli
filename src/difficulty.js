// Keyword difficulty (0-100, higher = harder): the ASOManiac model, calibrated against third-party
// difficulty scores (MAE 5.6, Pearson r 0.87). Three signals from the top 10 search results:
//   competition 55%: how many ratings the top apps have (log scale)
//   demand      10%: Apple Ads popularity + number of App Store autocomplete suggestions
//   quality     35%: how well rated the top apps are

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const normalize = (v, min, max) => (max <= min ? 0 : clamp((v - min) / (max - min), 0, 1));
const normalizeLog = (v, min, max) =>
  max <= min || v <= min ? 0 : clamp(Math.log1p(v - min) / Math.log1p(max - min), 0, 1);

export function difficultyScore(f) {
  const competition =
    normalizeLog(f.top10AvgRatingCount, 0, 5_000_000) * 0.45 +
    normalizeLog(f.top3AvgRatingCount, 0, 10_000_000) * 0.35 +
    normalizeLog(f.top10MaxRatingCount, 0, 30_000_000) * 0.1 +
    normalizeLog(f.top1RatingCount, 0, 30_000_000) * 0.1;
  const demand = normalize(f.popularity ?? 5, 5, 100) * 0.8 + normalize(f.autocompleteHintCount ?? 0, 0, 10) * 0.2;
  const quality = normalize(f.top10AvgRating, 3, 5);
  return clamp(Math.round((competition * 0.55 + demand * 0.1 + quality * 0.35) * 100), 0, 100);
}

const avg = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

// Builds the model's features from ranked search results.
export function difficulty(apps, { popularity = null, hintCount = 0 } = {}) {
  const top = apps.slice(0, 10);
  if (!top.length) return 0;
  const counts = top.map((a) => Math.max(0, a.ratingCount ?? 0));
  return difficultyScore({
    top10AvgRatingCount: avg(counts),
    top3AvgRatingCount: avg(counts.slice(0, 3)),
    top10MaxRatingCount: Math.max(...counts),
    top1RatingCount: counts[0],
    top10AvgRating: avg(top.map((a) => a.rating ?? 0)),
    popularity,
    autocompleteHintCount: hintCount,
  });
}

// How much to trust the score: enough competing apps and a real (non-floor) popularity.
export function confidence(appCount, popularity) {
  if (appCount >= 10 && popularity > 5) return 'high';
  return appCount >= 5 ? 'medium' : 'low';
}

// Simple sort key: popular and easy first. Not a traffic forecast.
export function opportunity(popularity, diff) {
  if (popularity == null || diff == null) return null;
  return Math.round((popularity * (100 - diff)) / 100);
}

export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const words = (s) => normalizeText(s).split(' ').filter(Boolean);

// How strongly an app's visible metadata targets the keyword (shown per top app).
export function keywordMatch(keyword, title, subtitle) {
  const k = normalizeText(keyword);
  const kw = words(keyword);
  const t = ` ${normalizeText(title)} `;
  const s = ` ${normalizeText(subtitle)} `;
  const has = (text, w) => text.includes(` ${w} `);
  if (!k) return 'none';
  if (t.includes(` ${k} `)) return 'titleExactPhrase';
  if (kw.every((w) => has(t, w))) return 'titleAllWords';
  if (s.includes(` ${k} `)) return 'subtitleExactPhrase';
  if (` ${normalizeText(`${title} ${subtitle}`)} `.includes(` ${k} `)) return 'combinedPhrase';
  if (kw.every((w) => has(s, w) || has(t, w))) return 'subtitleAllWords';
  return 'none';
}

// A brand keyword is someone else's name ("spotify", "calm app"): every word is in the #1 app's
// developer name and that app clearly owns the term. Adapted from semihcihan/App-Store-Optimization-CLI (MIT).
const BRAND_FILLER = new Set(['app', 'apps', 'the', 'official', 'ios', 'iphone', 'ipad', 'inc', 'llc', 'ltd']);
export function isBrandKeyword(keyword, apps) {
  const leader = apps[0];
  if (!leader?.developer) return false;
  const terms = words(keyword).filter((w) => !BRAND_FILLER.has(w));
  const dev = new Set(words(leader.developer));
  const name = new Set(words(leader.name));
  if (!terms.length || !terms.every((w) => dev.has(w) || (name.has(w) && dev.has(terms[0])))) return false;
  if ((leader.ratingCount ?? 0) >= 1000) return true;
  const others = apps.slice(1, 5).filter((a) => a.developer !== leader.developer).map((a) => a.ratingCount ?? 0).sort((a, b) => a - b);
  const median = others.length ? others[Math.floor(others.length / 2)] : 0;
  return median >= 10000;
}
