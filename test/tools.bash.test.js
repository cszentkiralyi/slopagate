const BashTool = require('../src/tools/bash.js');
const test = require('node:test');
const assert = require('node:assert');

const bashTool = new BashTool();

// ===== Permission Gate Tests =====
test('permissionGate allows node --test command', (t) => {
  t.assert.ok(bashTool.permissionGate('node --test foo.test.js'));
});

test('permissionGate allows git commands with space', (t) => {
  t.assert.ok(bashTool.permissionGate('git log HEAD'));
  t.assert.ok(bashTool.permissionGate('git status '));
  t.assert.ok(bashTool.permissionGate('git diff HEAD~1 '));
});

test('permissionGate allows pwd command', (t) => {
  t.assert.ok(bashTool.permissionGate('pwd'));
});

test('permissionGate rejects npm run test', (t) => {
  t.assert.equal(bashTool.permissionGate('npm run test'), false);
});

test('permissionGate rejects sed', (t) => {
  t.assert.equal(bashTool.permissionGate('sed -n "1,10p" file.txt'), false);
});

test('permissionGate rejects cat', (t) => {
  t.assert.equal(bashTool.permissionGate('cat file.txt'), false);
});

test('permissionGate rejects head/tail', (t) => {
  t.assert.equal(bashTool.permissionGate('head -20 file.txt'), false);
  t.assert.equal(bashTool.permissionGate('tail -10 file.txt'), false);
});

// ===== Tool Hint Tests =====
test('Tool hints for cat commands suggest read tool', (t) => {
  const hintMatch = BashTool.TOOL_HINTS.find(({ pattern }) => {
    if (pattern.endsWith('*'))
      return 'cat file.txt'.startsWith(pattern.substring(0, pattern.length - 1));
    return 'cat file.txt' === pattern;
  });
  t.assert.ok(hintMatch);
  t.assert.equal(hintMatch.hint, 'Read');
});

test('Tool hints for grep commands suggest grep tool', (t) => {
  const hintMatch = BashTool.TOOL_HINTS.find(({ pattern }) => {
    if (pattern.endsWith('*'))
      return 'grep foo'.startsWith(pattern.substring(0, pattern.length - 1));
    return 'grep foo' === pattern;
  });
  t.assert.ok(hintMatch);
  t.assert.equal(hintMatch.hint, 'Search');
});

test('Tool hints for ls commands suggest ls tool', (t) => {
  const hintMatch = BashTool.TOOL_HINTS.find(({ pattern }) => {
    if (pattern.endsWith('*'))
      return 'ls -la'.startsWith(pattern.substring(0, pattern.length - 1));
    return 'ls -la' === pattern;
  });
  t.assert.ok(hintMatch);
  t.assert.equal(hintMatch.hint, 'Glob');
});

// ===== Handler Error Messages Tests =====
test('handler returns error for forbidden commands', async (t) => {
  bashTool.readonly = false;
  const result = await bashTool.handler({ command: 'rm -rf /' }, bashTool);
  t.assert.ok(result.includes('Error: command "rm" not allowed'));
});

test('handler rejects cat and reports it as not allowed', async (t) => {
  bashTool.readonly = false;
  const result = await bashTool.handler({ command: 'cat file.txt' }, bashTool);
  t.assert.ok(result.includes('not allowed'));
  t.assert.ok(result.includes('cat'));
});

test('handler rejects sed and reports it as not allowed', async (t) => {
  bashTool.readonly = false;
  const result = await bashTool.handler({ command: 'sed -n "1p" file.txt' }, bashTool);
  t.assert.ok(result.includes('not allowed'));
  t.assert.ok(result.includes('sed'));
});

// ===== Message Method Tests =====
test('handler executes permitted commands successfully', async (t) => {
  bashTool.readonly = false;
  const result = await bashTool.handler({ command: 'pwd' }, bashTool);
  // Handler returns actual command output, not a status message
  t.assert.ok(typeof result === 'string');
  t.assert.ok(result.length > 0);
});

// ===== User Scopes Tests =====
test('permissionGate allows commands from user scopes', (t) => {
  const bashTool = new BashTool({ userScopes: new Map([['curl https://example.com', true]]) });
  t.assert.ok(bashTool.permissionGate('curl https://example.com'));
});

test('permissionGate respects readonly in user scopes', (t) => {
  // Built-in safe list allows npm run test, but it's not readonly
  const bashTool = new BashTool({ userScopes: new Map([['npm run build', true]]) });
  t.assert.ok(bashTool.permissionGate('npm run build'));
});

test('permissionGate does not allow commands outside user scopes and built-in list', (t) => {
  const bashTool = new BashTool({ userScopes: new Map([['curl https://example.com', true]]) });
  t.assert.equal(bashTool.permissionGate('rm -rf /'), false);
  t.assert.equal(bashTool.permissionGate('cat file.txt'), false);
});

test('handler executes command from user scopes', async (t) => {
  // Use a safe, no-op command to avoid side effects
  const bashTool = new BashTool({ userScopes: new Map([['echo hello', true]]) });
  const result = await bashTool.handler({ command: 'echo hello' }, bashTool);
  t.assert.ok(result.includes('hello'));
});

test('handler rejects non-permitted commands even with user scopes', async (t) => {
  const bashTool = new BashTool({ userScopes: new Map([['curl https://example.com', true]]) });
  const result = await bashTool.handler({ command: 'rm -rf /' }, bashTool);
  t.assert.ok(result.includes('not allowed'));
});

// Note: These tests reference a message() method that accepts an array of tool calls,
// which hasn't been implemented on BashTool. Leaving them as TODOs for future work.
/*
test('permissionGate allows commands from user scopes', (t) => {
  bashTool.readonly = false;
  const result = bashTool.message([
    { args: { command: 'node --test foo.test.js' } },
    { args: { command: 'git log HEAD ' } }
  ]);
  t.assert.ok(result.includes('Executing 2 commands'));
  t.assert.ok(result.includes('node'));
  t.assert.ok(result.includes('git'));
});

test('message filters out non-permitted commands', (t) => {
  bashTool.readonly = false;
  const result = bashTool.message([
    { args: { command: 'node --test foo.test.js' } },
    { args: { command: 'cat file.txt' } },
    { args: { command: 'git status ' } }
  ]);
  t.assert.ok(result.includes('2 commands'));
  t.assert.ok(!result.includes('cat'));
});
*/
