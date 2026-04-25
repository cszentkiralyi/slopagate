const Context = require('../src/lib/context.js');
const test = require('node:test');
const assert = require('node:assert');
const BashTool = require('../src/tools/bash.js');

test('BashTool executes simple commands', async (t) => {
  const tool = new BashTool({ readonly: false });

  const result = await tool.handler({ command: 'echo hello' }, tool);
  
  t.assert.ok(result.includes('hello'), 'Should return output of echo command');
});

test('BashTool captures stderr', async (t) => {
  const tool = new BashTool({ readonly: false });

  const result = await tool.handler({ command: 'echo hello >&2' }, tool);
  
  t.assert.ok(result.includes('hello'), 'Should return output including stderr');
});

test('BashTool handles exit codes via error message', async (t) => {
  const tool = new BashTool({ readonly: false });

  const result = await tool.handler({ command: 'exit 42' }, tool);
  
  t.assert.ok(result.includes('Error: exit code'), 'Should report exit code error');
});

test('BashTool blocks non-permitted commands by default', async (t) => {
  const tool = new BashTool({ readonly: true });

  const result = await tool.handler({ command: 'rm -rf /' }, tool);
  
  t.assert.equal(result, 'Error: Command not permitted', 'Should block non-permitted commands');
});

test('BashTool allows npm run test when readonly', async (t) => {
  const tool = new BashTool({ readonly: true });

  const result = await tool.handler({ command: 'npm run test' }, tool);
  
  t.assert.notEqual(result, 'Error: Command not permitted', 'Should allow npm run test');
});

test('BashTool blocks readonly commands when not in safe list', async (t) => {
  const tool = new BashTool({ readonly: true });

  const result = await tool.handler({ command: 'ls' }, tool);
  
  t.assert.equal(result, 'Error: Command not permitted', 'Should block ls when readonly');
});

test('BashTool allows git log when readonly', async (t) => {
  const tool = new BashTool({ readonly: true });

  const result = await tool.handler({ command: 'git log *' }, tool);
  
  t.assert.notEqual(result, 'Error: Command not permitted', 'Should allow git log');
});

test('BashTool handles command not found', async (t) => {
  const tool = new BashTool({ readonly: false });

  const result = await tool.handler({ command: 'nonexistent_command_xyz' }, tool);
  
  t.assert.ok(result.includes('Error'), 'Should handle command not found gracefully');
});

test('BashTool handles multiline output', async (t) => {
  const tool = new BashTool({ readonly: false });

  const result = await tool.handler({ command: 'echo -e "line1\\nline2\\nline3"' }, tool);
  
  t.assert.ok(result.includes('line1'), 'Should capture multiline output');
  t.assert.ok(result.includes('line3'), 'Should capture all lines');
});

test('BashTool works with Context integration', async (t) => {
  const tools = { bash: new BashTool({ readonly: false }) };
  const context = new Context({ tools });
  
  context.add({ role: 'user', content: 'What is 2 + 2?' });
  context.add({ role: 'assistant', content: 'bash', params: { command: 'echo 2 + 2 = 4' } });
  
  context.compact([]);
  
  t.assert.equal(context.messages.length, 2, 'Messages should be preserved');
});
