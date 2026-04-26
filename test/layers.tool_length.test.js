const { test } = require('node:test');
const tool_length = require('../src/lib/layers/tool_length.js');

test('tool_length: skips when no messages', (t) => {
  const result = tool_length({ messages: null, tools: {} });
  t.assert.strictEqual(result, undefined);
});

test('tool_length: skips when messages is undefined', (t) => {
  const result = tool_length({ messages: undefined, tools: {} });
  t.assert.strictEqual(result, undefined);
});

test('tool_length: handles empty messages array', (t) => {
  const result = tool_length({ messages: [], tools: {} });
  t.assert.deepStrictEqual(result, { messages: [] });
});

test('tool_length: skips non-tool messages', (t) => {
  const messages = [
    { role: 'system', content: 'test' },
    { role: 'user', content: 'test' }
  ];
  const tools = {};
  const result = tool_length({ messages, tools });
  t.assert.deepStrictEqual(result, { messages });
});

test('tool_length: skips non-existent tool', (t) => {
  const messages = [{
    role: 'tool',
    name: 'unknown_tool',
    content: 'long content'
  }];
  const tools = {};
  const result = tool_length({ messages, tools });
  t.assert.deepStrictEqual(result, { messages });
});

test('tool_length: handles tool with short content', (t) => {
  const messages = [{
    role: 'tool',
    name: 'fetch',
    content: 'short'
  }];
  const tools = {
    fetch: { maxLength: 2000 }
  };
  const result = tool_length({ messages, tools });
  t.assert.strictEqual(result.messages[0].content, 'short');
});

test('tool_length: truncates tool exceeding maxLength', (t) => {
  const longContent = 'x'.repeat(3000);
  const messages = [{
    role: 'tool',
    name: 'fetch',
    content: longContent
  }];
  const tools = {
    fetch: { maxLength: 2000 }
  };
  const result = tool_length({ messages, tools });
  t.assert.ok(result.messages[0].content.includes('[...trimmed tool output...]'));
  t.assert.ok(result.messages[0].content.includes('x'));
});

test('tool_length: default maxLength is 2000', (t) => {
  const longContent = 'y'.repeat(2500);
  const messages = [{
    role: 'tool',
    name: 'fetch',
    content: longContent
  }];
  const tools = {
    fetch: {} // No maxLength specified
  };
  const result = tool_length({ messages, tools });
  t.assert.ok(result.messages[0].content.includes('[...trimmed tool output...]'));
});

test('tool_length: preserves middle third of truncated content', (t) => {
  const longContent = '1'.repeat(100) + '2'.repeat(100) + '3'.repeat(100) + '4'.repeat(100) + '5'.repeat(100);
  const messages = [{
    role: 'tool',
    name: 'fetch',
    content: longContent
  }];
  const tools = {
    fetch: { maxLength: 100 }
  };
  const result = tool_length({ messages, tools });
  // Should keep middle portion, which includes '3' section
  t.assert.ok(result.messages[0].content.includes('3'));
  // Should NOT have first or last sections (1 and 5)
  t.assert.ok(!result.messages[0].content.includes('1'));
  t.assert.ok(!result.messages[0].content.includes('5'));
});