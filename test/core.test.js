import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordMatch, difficulty, opportunity, normalizeText } from '../src/difficulty.js';
import { lintMetadata, singular } from '../src/lint.js';
import { parseCount, serializedData } from '../src/apple/store.js';
import { storefront } from '../src/storefronts.js';

process.env.ASO_HOME = '/tmp/aso-unit-test';
const { parseTerms } = await import('../src/research.js');

test('normalizeText strips accents and punctuation', () => {
  assert.equal(normalizeText('Café: Sleep-Sounds!'), 'cafe sleep sounds');
});

test('keywordMatch ranks title matches above subtitle matches', () => {
  assert.equal(keywordMatch('white noise', 'White Noise Lite', ''), 'titleExactPhrase');
  assert.equal(keywordMatch('noise white', 'White Noise Lite', ''), 'titleAllWords');
  assert.equal(keywordMatch('sleep sounds', 'Calm', 'Sleep sounds & more'), 'subtitleExactPhrase');
  assert.equal(keywordMatch('rain fan', 'Rain', 'Fan'), 'combinedPhrase');
  assert.equal(keywordMatch('yoga', 'Calm', 'Sleep'), 'none');
});

test('difficulty is 1 with fewer than 5 competing apps', () => {
  assert.equal(difficulty('x', [{ name: 'a' }], 1), 1);
});

test('difficulty grows with competitor strength', () => {
  const now = Date.parse('2026-09-01');
  const weak = Array.from({ length: 5 }, (_, i) => ({ name: `App ${i}`, ratingCount: 3, rating: 3.5, releasedAt: '2020-01-01', updatedAt: '2021-01-01' }));
  const strong = Array.from({ length: 5 }, () => ({ name: 'White Noise', ratingCount: 500000, rating: 4.8, releasedAt: '2016-01-01', updatedAt: '2026-08-20' }));
  const easy = difficulty('white noise', weak, 30, now);
  const hard = difficulty('white noise', strong, 200, now);
  assert.ok(easy < 20, `easy=${easy}`);
  assert.ok(hard > 80, `hard=${hard}`);
});

test('opportunity', () => {
  assert.equal(opportunity(60, 50), 30);
  assert.equal(opportunity(null, 50), null);
});

test('lint catches the classic mistakes', () => {
  const r = lintMetadata({ title: 'Sleep Sounds', subtitle: 'White noise', keywords: 'sleep, rain,the,rains' });
  const rules = r.issues.map((i) => i.rule);
  assert.equal(r.pass, false);
  for (const rule of ['no-spaces-after-commas', 'cross-field-duplicate', 'stop-words', 'duplicate-keyword', 'utilization']) {
    assert.ok(rules.includes(rule), `missing ${rule}: ${rules}`);
  }
});

test('lint passes clean metadata', () => {
  const r = lintMetadata({ title: 'Lumen: Sleep Sounds', subtitle: 'White noise & rain for babies', keywords: 'fan,ocean,storm,relax,nap,insomnia,tinnitus,lullaby,meditation,focus,study,calm,thunder,wave,night' });
  assert.equal(r.pass, true, JSON.stringify(r.issues));
  assert.ok(r.score >= 80);
});

test('lint max length counts characters, not bytes', () => {
  assert.equal(lintMetadata({ title: 'ü'.repeat(30) }).issues.some((i) => i.rule === 'max-length'), false);
  assert.equal(lintMetadata({ title: 'a'.repeat(31) }).issues.some((i) => i.rule === 'max-length'), true);
});

test('singular', () => {
  assert.equal(singular('sounds'), 'sound');
  assert.equal(singular('stories'), 'story');
  assert.equal(singular('boxes'), 'box');
  assert.equal(singular('glass'), 'glass');
});

test('parseCount', () => {
  assert.equal(parseCount('208K'), 208000);
  assert.equal(parseCount('1.2M'), 1200000);
  assert.equal(parseCount(42), 42);
  assert.equal(parseCount(undefined), null);
});

test('serializedData reads embedded App Store JSON', () => {
  const html = '<script type="application/json" id="serialized-server-data">{"data":[{"data":{"shelves":[1]}}]}</script>';
  assert.deepEqual(serializedData(html), { shelves: [1] });
  assert.equal(serializedData('<html></html>'), null);
});

test('parseTerms splits, trims, lowercases and dedupes', () => {
  assert.deepEqual(parseTerms(['White Noise, sleep  sounds', 'white noise', 'fan']), ['white noise', 'sleep sounds', 'fan']);
});

test('storefront lookup', () => {
  assert.equal(storefront('de').id, 143443);
  assert.equal(storefront('ee').ads, false);
  assert.equal(storefront('zz'), null);
});
