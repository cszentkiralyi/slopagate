const test = require('node:test');
const assert = require('node:assert');
const Permissions = require('../src/lib/permissions');

test('all tool-scope combinations denied by default', (t) => {
  const perms = new Permissions();

  const result = perms.check('Bash', 'git status');
  assert.ok(!result.allowed);
  assert.deepStrictEqual(result.suggestions, []);
  assert.strictEqual(result.scope, 'git status');

  const result2 = perms.check('Edit', 'README.md');
  assert.ok(!result2.allowed);
  assert.deepStrictEqual(result2.suggestions, []);

  // checkScope also denied with no approvals
  const result3 = perms.checkScope('Bash:ls -la');
  assert.ok(!result3.allowed);
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
  assert.ok(!perms.check('Edit', 'git status').allowed);

  // Different scope for the same tool is denied
  assert.ok(!perms.check('Bash', 'ls -la').allowed);

  // serialize / deserialize preserves isolation
  const serialized = perms.serialize();
  assert.deepStrictEqual(serialized, { Bash: [{ scope: 'git status', verdict: true }] });

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

  // Approved wildcard scope auto-approves matching requests
  const result = perms.check('Bash', 'src/lib/context.js');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.scope, 'src/lib/*');

  // Approved exact-only scope does NOT match wildcard requests
  const result0 = perms.check('Bash', 'README/*');
  assert.ok(!result0.allowed);
  assert.deepStrictEqual(result0.suggestions, []);

  // Non-matching scope returns no suggestions
  const result2 = perms.check('Bash', 'other/path');
  assert.ok(!result2.allowed);
  assert.deepStrictEqual(result2.suggestions, []);
});

test('getUserScopes returns empty Map when no scopes approved', () => {
  const perms = new Permissions();
  assert.deepStrictEqual(perms.getUserScopes('Bash').size, 0);
});

test('getUserScopes returns empty Map for unknown tool', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'git status');
  const result = perms.getUserScopes('Edit');
  assert.ok(result instanceof Map);
  assert.strictEqual(result.size, 0);
});

test('getUserScopes returns new Map instance each call', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'git status');
  const a = perms.getUserScopes('Bash');
  const b = perms.getUserScopes('Bash');
  assert.notStrictEqual(a, b);
});

test('getUserScopes excludes denied scopes', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'git log *');
  perms.deny('Bash', 'rm -rf /');
  const result = perms.getUserScopes('Bash');
  assert.strictEqual(result.get('git log *'), true);
  assert.ok(!result.has('rm -rf /'));
});

test('getUserScopes includes approved wildcards with their wildcard form', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'src/lib/*');
  const result = perms.getUserScopes('Bash');
  assert.strictEqual(result.get('src/lib/*'), true);
});

test('findParents works with wildcard-approved scopes', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'src/lib/*');
  const parents = perms.findParents('Bash', 'src/lib/context.js');
  assert.deepStrictEqual(parents, ['src/lib/*']);

  // Multiple approved wildcards can match a single request
  perms.approve('Bash', 'src/*');
  const parents2 = perms.findParents('Bash', 'src/lib/context.js');
  assert.deepStrictEqual(parents2, ['src/lib/*', 'src/*']);
});

test('getUserScopes returns only approved scopes for a tool', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'git status');
  perms.approve('Bash', 'git log *');
  perms.deny('Bash', 'rm -rf /');

  const userScopes = perms.getUserScopes('Bash');
  assert.strictEqual(userScopes.size, 2);
  assert.ok(userScopes.has('git status'));
  assert.ok(userScopes.has('git log *'));
  // Denied scope should not be included
  assert.ok(!userScopes.has('rm -rf /'));
});

test('getUserScopes returns empty Map for unknown tool', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'git status');

  const userScopes = perms.getUserScopes('Edit');
  assert.strictEqual(userScopes.size, 0);
});

test('getUserScopes returns new Map instance each call', () => {
  const perms = new Permissions();
  perms.approve('Bash', 'git status');

  const scopes1 = perms.getUserScopes('Bash');
  const scopes2 = perms.getUserScopes('Bash');
  // Should be different instances
  assert.notStrictEqual(scopes1, scopes2);
  // But same content
  assert.deepStrictEqual([...scopes1], [...scopes2]);
});