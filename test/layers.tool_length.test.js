const { test } = require('node:test');
const { assert } = require('node:assert');
const tool_length = require('../../src/lib/layers/tool_length.js');

test('tool_length: skips when no messages', () => {
  const result = tool_length({ messages: null, tools: {} });
  assert.strictEqual(result, undefined);
});

test('tool_length: skips when messages is undefined', () => {
  const result = tool_length({ messages: undefined, tools: {} });
  assert.strictEqual(result, undefined);
});

test('tool_length: handles empty messages array', () => {
  const result = tool_length({ messages: [], tools: {} });
  assert.deepStrictEqual(result, { messages: [] });
});

test('tool_length: skips non-tool messages', () => {
  const messages = [
    { role: 'system', content: 'test' },
    { role: 'user', content: 'test' }
  ];
  const tools = {};
  const result = tool_length({ messages, tools });
  assert.deepStrictEqual(result, { messages });
});

test('tool_length: skips non-existent tool', () => {
  const messages = [{
    role: 'tool',
    name: 'unknown_tool',
    content: 'long content'
  }];
  const tools = {};
  const result = tool_length({ messages, tools });
  assert.deepStrictEqual(result, { messages });
});

test('tool_length: handles tool with short content', () => {
  const messages = [{
    role: 'tool',
    name: 'fetch',
    content: 'short'
  }];
  const tools = {
    fetch: { maxLength: 2000 }
  };
  const result = tool_length({ messages, tools });
  assert.strictEqual(result.messages[0].content, 'short');
});

test('tool_length: truncates tool exceeding maxLength', () => {
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
  assert(result.messages[0].content.includes('[...trimmed tool output...]'));
  assert(result.messages[0].content.includes('x'));
});

test('tool_length: default maxLength is 2000', () => {
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
  assert(result.messages[0].content.includes('[...trimmed tool output...]'));
});

test('tool_length: preserves middle third of truncated content', () => {
  const longContent = 'a'.repeat(100) + 'b'.repeat(100) + 'c'.repeat(100) + 'd'.repeat(100) + 'e'.repeat(100);
  const messages = [{
    role: 'tool',
    name: 'fetch',
    content: longContent
  }];
  const tools = {
    fetch: { maxLength: 100 }
  };
  const result = tool_length({ messages, tools });
  // Should keep middle portion, which includes 'b' section
  assert(result.messages[0].content.includes('b'));
  // Should NOT have first or last sections (a and e)
  assert(!result.messages[0].content.includes('a'));
  assert(!result.messages[0].content.includes('e'));
});