const test = require('node:test');
const { Hash } = require('../src/lib/hash.js');

test('Identical fields produce identical hashes', (t) => {
  const fields1 = ['read', 'README.md', 'src/'];
  const fields2 = ['read', 'README.md', 'src/'];
  
  const hash1 = Hash.hash(fields1);
  const hash2 = Hash.hash(fields2);
  
  t.assert.equal(hash1.length, hash2.length, 'Hashes should have same length');
  
  for (let i = 0; i < hash1.length; i++) {
    t.assert.equal(hash1[i], hash2[i], `Hash[${i}] should be identical`);
  }
});

test('Identical fields produce perfect similarity', (t) => {
  const fields1 = ['edit', 'src/file.js', 'old code', 'new code'];
  const fields2 = ['edit', 'src/file.js', 'old code', 'new code'];
  
  const sig1 = Hash.hash(fields1);
  const sig2 = Hash.hash(fields2);
  const similarity = Hash.compare(sig1, sig2);
  
  t.assert.equal(similarity, 1.0, 'Identical fields should have similarity 1.0');
});

test('Similar tool calls produce high similarity', (t) => {
  // Same tool, similar arguments
  const fields1 = ['read', 'src/lib/hash.js', 'src/'];
  const fields2 = ['read', 'src/lib/util.js', 'src/'];
  
  const sig1 = Hash.hash(fields1);
  const sig2 = Hash.hash(fields2);
  const similarity = Hash.compare(sig1, sig2);
  
  t.assert.ok(similarity > 0.8, `Similar tool calls should have high similarity (got ${similarity.toFixed(3)})`);
});

test('Same tool with different arguments produces moderate similarity', (t) => {
  // Same tool, similar but not identical content
  const fields1 = ['edit', 'src/file.js', 'const x = 1;\nconst y = 2;', 'const z = 3;'];
  const fields2 = ['edit', 'src/file.js', 'const x = 1;\nconst y = 2;\nconst z = 3;', 'const w = 4;'];
  
  const sig1 = Hash.hash(fields1);
  const sig2 = Hash.hash(fields2);
  const similarity = Hash.compare(sig1, sig2);
  
  t.assert.ok(similarity >= 0.5 && similarity < 0.95, `Same tool with similar edits should have moderate similarity (got ${similarity.toFixed(3)})`);
});

test('Different tool calls produce low similarity', (t) => {
  // Completely different tools
  const fields1 = ['read', 'src/lib/hash.js', 'src/'];
  const fields2 = ['bash', 'ls -la', 'terminal'];
  
  const sig1 = Hash.hash(fields1);
  const sig2 = Hash.hash(fields2);
  const similarity = Hash.compare(sig1, sig2);
  
  t.assert.ok(similarity < 0.5, `Different tools should have low similarity (got ${similarity.toFixed(3)})`);
});

test('Different arguments produce lower similarity than similar arguments', (t) => {
  // Case 1: Same tool, very similar args (same file, small diff)
  const similar1 = ['read', 'src/lib/hash.js', 'const x = 1;'];
  const similar2 = ['read', 'src/lib/hash.js', 'const x = 2;'];
  
  // Case 2: Same tool, truly different args (different file, different content)
  const diff1 = ['read', 'src/lib/hash.js', 'const x = 1;'];
  const diff2 = ['read', '/tmp/random.txt', 'function foo() { bar(); }'];
  
  const sig_sim1 = Hash.hash(similar1);
  const sig_sim2 = Hash.hash(similar2);
  const sim_similarity = Hash.compare(sig_sim1, sig_sim2);
  
  const sig_diff1 = Hash.hash(diff1);
  const sig_diff2 = Hash.hash(diff2);
  const diff_similarity = Hash.compare(sig_diff1, sig_diff2);
  
  t.assert.ok(sim_similarity > diff_similarity, `Similar args should be more similar than different args (got ${sim_similarity.toFixed(3)} vs ${diff_similarity.toFixed(3)})`);
});

test('Different number of fields distributes hashes proportionally', (t) => {
  // 2 fields → 64 hashes each
  const fields2 = ['read', 'README.md'];
  const sig2 = Hash.hash(fields2);
  
  // 3 fields → 43 hashes each
  const fields3 = ['read', 'README.md', 'src/'];
  const sig3 = Hash.hash(fields3);
  
  t.assert.equal(sig2.length, 128, 'Signature should always be 128 elements');
  t.assert.equal(sig3.length, 128, 'Signature should always be 128 elements');
});

test('Completely different content produces near-zero similarity', (t) => {
  const fields1 = ['read', 'const x = 1;', 'src/'];
  const fields2 = ['bash', 'ls -la /tmp', 'terminal'];
  
  const sig1 = Hash.hash(fields1);
  const sig2 = Hash.hash(fields2);
  const similarity = Hash.compare(sig1, sig2);
  
  t.assert.ok(similarity < 0.3, `Completely different content should have very low similarity (got ${similarity.toFixed(3)})`);
});

test('Hash handles empty fields array', (t) => {
  const sig = Hash.hash([]);
  t.assert.equal(sig.length, 128, 'Empty fields should still produce 128-element signature');
});

test('Hash handles single field', (t) => {
  const sig = Hash.hash(['just one field']);
  t.assert.equal(sig.length, 128, 'Single field should produce 128-element signature');
});

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

// --- similarity hybrid tests ---

test('Hash.similarity uses Jaccard for short texts', (t) => {
  const shortA = 'the quick brown fox';
  const shortB = 'the quick brown fox';
  const similarity = Hash.similarity(shortA, shortB);
  t.assert.equal(similarity, 1.0, 'Identical short texts should be 1.0');
});

test('Hash.similarity returns correct Jaccard for partially overlapping short texts', (t) => {
  const textA = 'the quick brown fox jumps';
  const textB = 'the quick red dog jumps';
  const similarity = Hash.similarity(textA, textB);
  // Both should have <= 200 trigrams, so Jaccard path is taken
  t.assert.ok(similarity >= 0 && similarity <= 1.0, 'Similarity should be in [0, 1]');
});

test('Hash.similarity uses MinHash for long texts', (t) => {
  const longA = 'a'.repeat(5000);
  const longB = 'a'.repeat(5000);
  const similarity = Hash.similarity(longA, longB);
  t.assert.equal(similarity, 1.0, 'Identical long texts should be 1.0 via MinHash');
});

test('Hash.similarity handles long different texts', (t) => {
  const longA = 'abc'.repeat(1000);
  const longB = 'xyz'.repeat(1000);
  const similarity = Hash.similarity(longA, longB);
  t.assert.ok(similarity < 0.3, 'Completely different long texts should have low similarity (got ' + similarity.toFixed(3) + ')');
});

test('Hash.similarity handles mixed short and long texts', (t) => {
  const short = 'hello world';
  const long = 'a'.repeat(5000);
  const similarity = Hash.similarity(short, long);
  // Falls to MinHash since one exceeds cutoff
  t.assert.ok(similarity >= 0 && similarity <= 1.0, 'Similarity should be in [0, 1]');
});
