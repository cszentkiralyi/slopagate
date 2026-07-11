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
