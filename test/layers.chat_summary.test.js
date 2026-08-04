const test = require('node:test');
const assert = require('node:assert');
const chat_summary = require('../src/lib/layers/chat_summary.js');

test('returns as-is when no summary message exists', () => {
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
  ];
  const result = chat_summary({ messages });
  assert.deepStrictEqual(result.messages, messages);
});

test('drops older messages and changes summary role to user', () => {
  const messages = [
    { role: 'user', content: 'Old Q1' },
    { role: 'assistant', content: 'Old A1' },
    { role: 'summary', content: 'Context summary here' },
    { role: 'user', content: 'New Q2' },
    { role: 'assistant', content: 'New A2' },
  ];
  const result = chat_summary({ messages });
  assert.strictEqual(result.messages.length, 3);
  assert.strictEqual(result.messages[0].role, 'user');
  assert.strictEqual(result.messages[0].content, 'Context summary here');
  assert.strictEqual(result.messages[1].role, 'user');
  assert.strictEqual(result.messages[1].content, 'New Q2');
  assert.strictEqual(result.messages[2].role, 'assistant');
  assert.strictEqual(result.messages[2].content, 'New A2');
});

test('keeps only from most-recent summary', () => {
  const messages = [
    { role: 'summary', content: 'Old summary' },
    { role: 'user', content: 'Between' },
    { role: 'assistant', content: 'Resp' },
    { role: 'summary', content: 'New summary' },
    { role: 'user', content: 'After' },
  ];
  const result = chat_summary({ messages });
  assert.strictEqual(result.messages.length, 2);
  assert.strictEqual(result.messages[0].role, 'user');
  assert.strictEqual(result.messages[0].content, 'New summary');
  assert.strictEqual(result.messages[1].role, 'user');
  assert.strictEqual(result.messages[1].content, 'After');
});

test('returns as-is for empty messages', () => {
  const result = chat_summary({ messages: [] });
  assert.deepStrictEqual(result.messages, []);
});
