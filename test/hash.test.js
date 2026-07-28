const test = require('node:test');
const { Hash } = require('../src/lib/hash.js');

// --- trigrams tests ---

test('Hash.trigrams extracts correct trigrams', (t) => {
  const trigrams = Hash.trigrams('abc');
  t.assert.equal(trigrams.length, 1, 'Should have exactly 1 trigram');
  t.assert.equal(trigrams[0], 'abc', 'Trigram should be "abc"');
});

test('Hash.trigrams extracts overlapping trigrams', (t) => {
  const trigrams = Hash.trigrams('abcd');
  t.assert.equal(trigrams.length, 2, 'Should have 2 trigrams');
  t.assert.equal(trigrams[0], 'abc', 'First trigram should be "abc"');
  t.assert.equal(trigrams[1], 'bcd', 'Second trigram should be "bcd"');
});

test('Hash.trigrams handles short text (fewer than 3 chars)', (t) => {
  const trigrams = Hash.trigrams('ab');
  t.assert.equal(trigrams.length, 0, 'Text shorter than 3 chars should produce no trigrams');
});

// --- jaccard tests ---

test('Hash.jaccard returns 1.0 for identical trigrams', (t) => {
  const trigrams = ['abc', 'bcd', 'cde'];
  const similarity = Hash.jaccard(trigrams, trigrams);
  t.assert.equal(similarity, 1.0, 'Identical trigrams should have Jaccard similarity 1.0');
});

test('Hash.jaccard returns 0.0 for completely different trigrams', (t) => {
  const trigramsA = ['abc', 'bcd'];
  const trigramsB = ['xyz', 'wxy'];
  const similarity = Hash.jaccard(trigramsA, trigramsB);
  t.assert.equal(similarity, 0.0, 'No overlap should have Jaccard similarity 0.0');
});

test('Hash.jaccard returns correct partial similarity', (t) => {
  const trigramsA = ['abc', 'bcd', 'cde'];
  const trigramsB = ['bcd', 'cde', 'def'];
  // intersection: {bcd, cde} = 2, union: {abc, bcd, cde, def} = 4
  const similarity = Hash.jaccard(trigramsA, trigramsB);
  t.assert.equal(similarity, 0.5, 'Partial overlap should have Jaccard similarity 0.5');
});

test('Hash.jaccard handles empty trigrams', (t) => {
  const similarity = Hash.jaccard([], []);
  t.assert.equal(similarity, 0.0, 'Both empty should return 0.0');
});

test('Hash.jaccard handles one empty trigram set', (t) => {
  const trigramsA = ['abc', 'bcd'];
  const similarity = Hash.jaccard(trigramsA, []);
  t.assert.equal(similarity, 0.0, 'One empty should return 0.0');
});

// --- cachedSimilarity tests ---

test('Hash.cachedSimilarity compares jaccard caches', (t) => {
  const cacheA = Hash.cache('the quick brown fox');
  const cacheB = Hash.cache('the quick brown fox');
  const similarity = Hash.cachedSimilarity(cacheA, cacheB);
  t.assert.equal(similarity, 1.0, 'Identical cached texts should be 1.0');
});

test('Hash.cachedSimilarity compares minhash caches', (t) => {
  const longA = 'a'.repeat(5000);
  const longB = 'a'.repeat(5000);
  const cacheA = Hash.cache(longA);
  const cacheB = Hash.cache(longB);
  const similarity = Hash.cachedSimilarity(cacheA, cacheB);
  t.assert.equal(similarity, 1.0, 'Identical long texts should be 1.0 via minhash');
});

test('Hash.cachedSimilarity returns 0 for mismatched types', (t) => {
  const shortCache = Hash.cache('hello');
  const longCache = Hash.cache('a'.repeat(5000));
  const similarity = Hash.cachedSimilarity(shortCache, longCache);
  t.assert.equal(similarity, 0, 'Mismatched types should return 0');
});
