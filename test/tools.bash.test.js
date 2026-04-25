const test = require('node:test');
const assert = require('node:assert');
const BashTool = require('../src/tools/bash.js');

test('BashTool permissionGate method', (t) => {
  const tool = new BashTool();

  t.assert.ok(tool.permissionGate('npm run test'), 'npm run test should be permitted');
  t.assert.ok(tool.permissionGate('node --test *'), 'node --test * should be permitted');
  t.assert.ok(tool.permissionGate('git log *'), 'git log * should be permitted');
  t.assert.ok(tool.permissionGate('git status *'), 'git status * should be permitted');
  t.assert.ok(tool.permissionGate('head *'), 'head * should be permitted');
  t.assert.ok(tool.permissionGate('tail *'), 'tail * should be permitted');
  t.assert.ok(tool.permissionGate('pwd'), 'pwd should be permitted');

  t.assert.ok(!tool.permissionGate('ls'), 'ls should not be permitted');
  t.assert.ok(!tool.permissionGate('cd /etc'), 'cd /etc should not be permitted');
  t.assert.ok(!tool.permissionGate('rm -rf /'), 'rm -rf / should not be permitted');
});

test('BashTool handler method', async (t) => {
  const tool = new BashTool();

  // Test permitted command
  const result1 = await tool.handler({ command: 'pwd' }, tool);
  t.assert.ok(result1.includes('/'), 'pwd should return home directory');

  // Test permitted command with stderr
  const result2 = await tool.handler({ command: 'pwd' }, tool);
  t.assert.ok(result2.trim().startsWith('/'), 'pwd should return home directory');

  // Test non-permitted command
  const result3 = await tool.handler({ command: 'ls' }, tool);
  t.assert.ok(result3 === 'Error: Command not permitted', 'non-permitted command should return error');
});

test('BashTool message method', (t) => {
  const tool = new BashTool();

  // Test single permitted command
  const calls1 = [{
    args: { command: 'pwd' }
  }];
  const message1 = tool.message(calls1);
  t.assert.ok(message1 === 'Executing pwd', 'single permitted command should show message');

  // Test multiple permitted commands
  const calls2 = [
    { args: { command: 'npm run test' } },
    { args: { command: 'git log *' } }
  ];
  const message2 = tool.message(calls2);
  t.assert.ok(message2.includes('Executing 2 commands'), 'multiple commands should show count');
  t.assert.ok(message2.includes('npm'), 'summary should include npm');
  t.assert.ok(message2.includes('git'), 'summary should include git');

  // Test no permitted commands
  const calls3 = [{ args: { command: 'ls' } }];
  const message3 = tool.message(calls3);
  t.assert.ok(message3 === 'No permitted commands to execute', 'no permitted commands should show message');
});