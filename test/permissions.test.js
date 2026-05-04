const test = require('node:test');
const assert = require('node:assert');
const Permissions = require('../src/lib/permissions');

test('all tool-scope combinations denied by default', (t) => {
  const perms = new Permissions();

  const result = perms.check('Bash', 'git status');
  assert.strictEqual(result.allowed, false);
  assert.deepStrictEqual(result.suggestions, []);
  assert.strictEqual(result.scope, 'git status');

  const result2 = perms.check('Edit', 'README.md');
  assert.strictEqual(result2.allowed, false);
  assert.deepStrictEqual(result2.suggestions, []);

  // checkScope also denied with no approvals
  const result3 = perms.checkScope('Bash:ls -la');
  assert.strictEqual(result3.allowed, false);
});

test('approved scopes are not denied', (t) => {
  const perms = new Permissions();
  perms.approve('Bash', 'git status');
  perms.approve('Edit', 'src/lib/utils.js');

  assert.strictEqual(perms.check('Bash', 'git status').allowed, true);
  assert.strictEqual(perms.check('Edit', 'src/lib/utils.js').allowed, true);

  // checkScope works too
  assert.strictEqual(perms.checkScope('Edit:src/lib/utils.js').allowed, true);

  // has() and getScopes()
  assert.strictEqual(perms.has('Bash', 'git status'), true);
  assert.strictEqual(perms.has('Bash', 'ls -la'), false);
  assert.deepStrictEqual(perms.getScopes('Bash'), ['git status']);
  assert.deepStrictEqual(perms.getScopes('Edit'), ['src/lib/utils.js']);
});

test('approved scopes are per-context', (t) => {
  const perms = new Permissions();
  perms.approve('Bash', 'git status');

  // Approved scope works for its tool
  assert.strictEqual(perms.check('Bash', 'git status').allowed, true);

  // Same scope for a different tool is still denied
  assert.strictEqual(perms.check('Edit', 'git status').allowed, false);

  // Different scope for the same tool is denied
  assert.strictEqual(perms.check('Bash', 'ls -la').allowed, false);

  // serialize / deserialize preserves isolation
  const serialized = perms.serialize();
  assert.deepStrictEqual(serialized, { Bash: ['git status'] });

  const restored = Permissions.deserialize(serialized);
  assert.strictEqual(restored.size, 1);
  assert.strictEqual(restored.has('Bash', 'git status'), true);
  assert.strictEqual(restored.has('Edit', 'git status'), false);

  // remove works
  perms.remove('Bash', 'git status');
  assert.strictEqual(perms.has('Bash', 'git status'), false);
  assert.strictEqual(perms.size, 0);
});

test('unapproved scopes return suggestions', (t) => {
  const perms = new Permissions();
  perms.approve('Bash', 'src/lib/*');
  perms.approve('Bash', 'README');

  // Approved wildcard scope matches non-exact requests
  const result = perms.check('Bash', 'src/lib/context.js');
  assert.strictEqual(result.allowed, false);
  assert.deepStrictEqual(result.suggestions, ['src/lib/*']);

  // Approved exact-only scope does NOT match wildcard requests
  const result0 = perms.check('Bash', 'README/*');
  assert.strictEqual(result0.allowed, false);
  assert.deepStrictEqual(result0.suggestions, []);

  // Non-matching scope returns no suggestions
  const result2 = perms.check('Bash', 'other/path');
  assert.strictEqual(result2.allowed, false);
  assert.deepStrictEqual(result2.suggestions, []);

  // findParents works with wildcard-approved scopes
  const parents = perms.findParents('Bash', 'src/lib/context.js');
  assert.deepStrictEqual(parents, ['src/lib/*']);

  // Multiple approved wildcards can match a single request
  perms.approve('Bash', 'src/*');
  const parents2 = perms.findParents('Bash', 'src/lib/context.js');
  assert.deepStrictEqual(parents2, ['src/lib/*', 'src/*']);
});