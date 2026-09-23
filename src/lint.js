// Deterministic App Store metadata checks (title / subtitle / keyword field).
import fs from 'node:fs';
import path from 'node:path';
import { words, normalizeText } from './difficulty.js';

export const LIMITS = { title: 30, subtitle: 30, keywords: 100 };

const STOP_WORDS = new Set(('a an and are as at be by for from in into is it its of on or the to with ' +
  'your you my our this that app apps free iphone ipad').split(' '));
const BRANDS = new Set(('apple siri facetime icloud google youtube gmail android facebook instagram whatsapp messenger ' +
  'tiktok snapchat twitter x telegram discord netflix spotify amazon alexa uber lyft airbnb zoom slack notion ' +
  'chatgpt openai claude gemini canva photoshop adobe microsoft excel word outlook teams paypal venmo ' +
  'tinder bumble duolingo calm headspace strava fitbit garmin pokemon minecraft roblox fortnite disney').split(' '));

// Crude English singulariser used only to spot plural/singular duplicates.
export function singular(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function lintMetadata({ title = '', subtitle = '', keywords = '', locale = 'en-US' } = {}) {
  const issues = [];
  const add = (severity, rule, message, field) => issues.push({ severity, rule, field, message });
  const english = /^en/i.test(locale);

  for (const [field, value] of Object.entries({ title, subtitle, keywords })) {
    if ([...value].length > LIMITS[field]) {
      add('error', 'max-length', `${field} is ${[...value].length}/${LIMITS[field]} characters`, field);
    }
  }
  if (!title.trim()) add('error', 'required', 'title is empty', 'title');

  const entries = keywords.split(',');
  if (/,\s/.test(keywords) || /\s,/.test(keywords)) {
    const wasted = (keywords.match(/\s+,|,\s+/g) || []).join('').replace(/,/g, '').length;
    add('error', 'no-spaces-after-commas', `remove spaces around commas (${wasted} wasted characters)`, 'keywords');
  }
  if (keywords && entries.some((e) => !e.trim())) add('warning', 'empty-entry', 'empty keyword entry (double or trailing comma)', 'keywords');

  const titleWords = words(title);
  const subtitleWords = words(subtitle);
  const keywordWords = words(keywords.replace(/,/g, ' '));
  const seen = new Map();
  const note = (w, field) => {
    const key = singular(w);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push({ w, field });
  };
  titleWords.forEach((w) => note(w, 'title'));
  subtitleWords.forEach((w) => note(w, 'subtitle'));
  keywordWords.forEach((w) => note(w, 'keywords'));

  for (const [, uses] of seen) {
    if (uses.length < 2) continue;
    const fields = uses.map((u) => u.field);
    const last = uses.at(-1);
    if (fields.includes('keywords') && fields.filter((f) => f === 'keywords').length < fields.length) {
      add('error', 'cross-field-duplicate',
        `"${last.w}" is already in the ${fields.find((f) => f !== 'keywords')}; remove it from the keyword field`, 'keywords');
    } else if (fields.every((f) => f === 'keywords')) {
      add('error', 'duplicate-keyword', `"${uses.map((u) => u.w).join('" / "')}" repeated in the keyword field`, 'keywords');
    } else if (fields.includes('title') && fields.includes('subtitle')) {
      add('warning', 'title-subtitle-duplicate', `"${last.w}" appears in both title and subtitle`, 'subtitle');
    }
  }

  if (english) {
    const stops = [...new Set(keywordWords.filter((w) => STOP_WORDS.has(w)))];
    if (stops.length) add('warning', 'stop-words', `drop low-value words from the keyword field: ${stops.join(', ')}`, 'keywords');
    const plurals = [...new Set(keywordWords.filter((w) => singular(w) !== w))];
    if (plurals.length) add('info', 'singular-forms', `prefer singular forms (Apple matches plurals): ${plurals.join(', ')}`, 'keywords');
  }

  const multiWord = entries.map((e) => e.trim()).filter((e) => e.includes(' '));
  if (multiWord.length) {
    add('info', 'single-words', `Apple combines single words across fields; phrases cost extra spaces: ${multiWord.join(' | ')}`, 'keywords');
  }

  const brands = [...new Set([...titleWords, ...subtitleWords, ...keywordWords].filter((w) => BRANDS.has(w)))];
  if (brands.length) add('warning', 'trademark-risk', `possible third-party trademarks (review rejection risk): ${brands.join(', ')}`);

  if (/[,|]/.test(title) || (title.match(/[-–—:]/g) || []).length > 1) {
    add('warning', 'natural-title', 'title looks like a keyword list; keep it readable: Brand + main keyword phrase', 'title');
  }

  const len = (s) => [...s].length;
  const unused = LIMITS.keywords - len(keywords);
  if (keywords && unused >= 10) add('warning', 'utilization', `keyword field has ${unused} unused characters`, 'keywords');
  if (!keywords) add('warning', 'utilization', 'keyword field is empty', 'keywords');
  if (subtitle === '') add('warning', 'utilization', 'subtitle is empty (30 indexed characters unused)', 'subtitle');

  const weights = { error: 15, warning: 5, info: 1 };
  const score = Math.max(0, 100 - issues.reduce((s, i) => s + weights[i.severity], 0));
  const unique = new Set([...titleWords, ...subtitleWords, ...keywordWords].map(singular));
  return {
    locale,
    pass: !issues.some((i) => i.severity === 'error'),
    score,
    issues,
    stats: {
      title: `${len(title)}/${LIMITS.title}`,
      subtitle: `${len(subtitle)}/${LIMITS.subtitle}`,
      keywords: `${len(keywords)}/${LIMITS.keywords}`,
      uniqueWords: unique.size,
      words: [...unique].sort(),
    },
  };
}

// Lints every locale folder of a fastlane `metadata/` directory.
export function lintFastlane(dir) {
  const read = (loc, f) => {
    try { return fs.readFileSync(path.join(dir, loc, f), 'utf8').replace(/\r?\n$/, ''); } catch { return null; }
  };
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (read(d.name, 'name.txt') !== null || read(d.name, 'keywords.txt') !== null))
    .map((d) => lintMetadata({
      locale: d.name,
      title: read(d.name, 'name.txt') ?? '',
      subtitle: read(d.name, 'subtitle.txt') ?? '',
      keywords: read(d.name, 'keywords.txt') ?? '',
    }));
}

export { normalizeText };
