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
  t.assert.equal(hintMatch.hint, 'read');
});

test('Tool hints for grep commands suggest grep tool', (t) => {
  const hintMatch = BashTool.TOOL_HINTS.find(({ pattern }) => {
    if (pattern.endsWith('*'))
      return 'grep foo'.startsWith(pattern.substring(0, pattern.length - 1));
    return 'grep foo' === pattern;
  });
  t.assert.ok(hintMatch);
  t.assert.equal(hintMatch.hint, 'grep');
});

test('Tool hints for ls commands suggest ls tool', (t) => {
  const hintMatch = BashTool.TOOL_HINTS.find(({ pattern }) => {
    if (pattern.endsWith('*'))
      return 'ls -la'.startsWith(pattern.substring(0, pattern.length - 1));
    return 'ls -la' === pattern;
  });
  t.assert.ok(hintMatch);
  t.assert.equal(hintMatch.hint, 'ls');
});

// ===== Handler Error Messages Tests =====
test('handler returns error for forbidden commands', async (t) => {
  bashTool.readonly = false;
  const result = await bashTool.handler({ command: 'rm -rf /' }, bashTool);
  t.assert.ok(result.includes('Error: command "rm" not allowed'));
});

test('handler returns error for cat with hint message', async (t) => {
  bashTool.readonly = false;
  const result = await bashTool.handler({ command: 'cat file.txt' }, bashTool);
  t.assert.ok(result.includes('use "read" tool instead'));
});

test('handler returns error for sed with hint message', async (t) => {
  bashTool.readonly = false;
  const result = await bashTool.handler({ command: 'sed -n "1p" file.txt' }, bashTool);
  t.assert.ok(result.includes('use "edit" tool instead'));
});

// ===== Message Method Tests =====
test('message returns permitted command when single command', (t) => {
  bashTool.readonly = false;
  const result = bashTool.message([{ args: { command: 'node --test foo.test.js' } }]);
  t.assert.ok(result.includes('Executing'));
  t.assert.ok(result.includes('node --test'));
});

test('message mentions multiple commands when multiple permitted', (t) => {
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
