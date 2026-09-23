// Keyword difficulty (1-100). Formula adapted from semihcihan/App-Store-Optimization-CLI (MIT).
// Each of the top apps gets a "competitive strength" 0..1 from ratings volume, rating velocity,
// rating quality, update recency and whether the keyword is in its title/subtitle. The keyword's
// difficulty blends the average and the weakest of those apps (the easiest one to beat) with
// how many apps compete at all.

const TOP_APPS = 5;
const MAX_RATINGS = 10000;
const MAX_COMPETING_APPS = 200;
const DAY = 86400e3;

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export const words = (s) => normalizeText(s).split(' ').filter(Boolean);

// How strongly an app's visible metadata targets the keyword.
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

const MATCH_SCORE = {
  titleExactPhrase: 1, titleAllWords: 0.8, subtitleExactPhrase: 0.5,
  combinedPhrase: 0.4, subtitleAllWords: 0.4, none: 0,
};

function ratingVelocityScore(perDay) {
  if (perDay <= 0) return 0;
  if (perDay <= 1) return perDay * 0.25;
  if (perDay < 100) return 0.25 + 0.75 * ((perDay - 1) / 99);
  return 1;
}

function ratingQualityScore(avg, count) {
  if (!(avg > 3)) return 0;
  return clamp((avg - 3) / 2) * Math.min(count, 20) / 20;
}

const daysSince = (date, now) => {
  const t = Date.parse(date ?? '');
  return Number.isFinite(t) ? Math.max(1, (now - t) / DAY) : 365;
};

export function appStrength(app, keyword, now = Date.now()) {
  const count = Math.max(0, app.ratingCount ?? 0);
  const perDay = count / daysSince(app.releasedAt, now);
  const match = keywordMatch(keyword, app.name, app.subtitle);
  const score =
    (0.2 * clamp(count / MAX_RATINGS) +
      0.1 * ratingQualityScore(app.rating ?? 0, count) +
      0.1 * (1 - clamp(daysSince(app.updatedAt, now) / 365)) +
      0.3 * MATCH_SCORE[match] +
      0.3 * ratingVelocityScore(perDay)) / 1.0;
  return { score, match };
}

export function difficulty(keyword, apps, appCount, now = Date.now()) {
  const top = apps.slice(0, TOP_APPS);
  // Fewer than 5 competing apps: anyone can rank.
  if (top.length < TOP_APPS || appCount < TOP_APPS) return 1;
  const scores = top.map((a) => appStrength(a, keyword, now).score);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const min = Math.min(...scores);
  const crowd = appCount <= 10 ? 0 : clamp((appCount - 10) / (MAX_COMPETING_APPS - 10));
  const raw = (0.5 * crowd + 2 * avg + 4 * min) / 6.5;
  return Math.round(clamp(raw * 100, 1, 100));
}

// Simple sort key: popular and easy first. Not a traffic forecast.
export function opportunity(popularity, diff) {
  if (popularity == null || diff == null) return null;
  return Math.round((popularity * (100 - diff)) / 100);
}
