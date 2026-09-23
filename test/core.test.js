import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keywordMatch, difficulty, difficultyScore, opportunity, normalizeText, confidence, isBrandKeyword } from '../src/difficulty.js';
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

test('difficulty matches the calibrated ASOManiac model', () => {
  // Reference values computed with the original AppStoreAdsScraper implementation's formula.
  assert.equal(difficultyScore({ top10AvgRatingCount: 0, top3AvgRatingCount: 0, top10MaxRatingCount: 0, top1RatingCount: 0, top10AvgRating: 0, popularity: 5, autocompleteHintCount: 0 }), 0);
  assert.equal(difficultyScore({ top10AvgRatingCount: 5e6, top3AvgRatingCount: 1e7, top10MaxRatingCount: 3e7, top1RatingCount: 3e7, top10AvgRating: 5, popularity: 100, autocompleteHintCount: 10 }), 100);
});

test('difficulty grows with competitor strength', () => {
  const weak = Array.from({ length: 10 }, () => ({ ratingCount: 3, rating: 3.2 }));
  const strong = Array.from({ length: 10 }, () => ({ ratingCount: 500000, rating: 4.8 }));
  assert.ok(difficulty(weak, { popularity: 20 }) < 20);
  assert.ok(difficulty(strong, { popularity: 60, hintCount: 10 }) > 70);
  assert.equal(difficulty([]), 0);
});

test('confidence', () => {
  assert.equal(confidence(50, 40), 'high');
  assert.equal(confidence(50, 5), 'medium');
  assert.equal(confidence(2, 40), 'low');
});

test('brand keywords are detected', () => {
  const apps = [{ name: 'Spotify: Music and Podcasts', developer: 'Spotify', ratingCount: 30000000 }, { name: 'Other', developer: 'X', ratingCount: 10 }];
  assert.equal(isBrandKeyword('spotify', apps), true);
  assert.equal(isBrandKeyword('spotify music', apps), true);
  assert.equal(isBrandKeyword('music player', apps), false);
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

test('keyword field limit is 100 UTF-8 bytes', () => {
  const ja = 'カメラ'.repeat(12); // 36 characters, 108 bytes
  assert.ok(lintMetadata({ title: 'A', keywords: ja }).issues.some((i) => i.rule === 'max-length'));
  assert.ok(!lintMetadata({ title: 'A', keywords: 'a'.repeat(100) }).issues.some((i) => i.rule === 'max-length'));
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
