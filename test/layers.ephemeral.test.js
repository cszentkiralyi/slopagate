const test = require('node:test');
const assert = require('node:assert');
const ephemeral = require('../src/lib/layers/ephemeral.js');

test('compaction drops ephemeral messages', (t) => {
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Response', ephemeral: true },
    { role: 'user', content: 'Follow up' },
    { role: 'tool', content: 'Result', ephemeral: true },
    { role: 'assistant', content: 'Final answer' },
  ];

  const result = ephemeral({ messages });

  assert.strictEqual(result.messages.length, 3);
  assert.strictEqual(result.messages[0].content, 'Hello');
  assert.strictEqual(result.messages[1].content, 'Follow up');
  assert.strictEqual(result.messages[2].content, 'Final answer');
});

test('compaction with no ephemeral messages returns all', (t) => {
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Response' },
    { role: 'user', content: 'Follow up' },
  ];

  const result = ephemeral({ messages });

  assert.strictEqual(result.messages.length, 3);
});

test('compaction with all ephemeral messages returns empty', (t) => {
  const messages = [
    { role: 'assistant', content: 'Temp', ephemeral: true },
    { role: 'tool', content: 'Temp result', ephemeral: true },
  ];

  const result = ephemeral({ messages });

  assert.strictEqual(result.messages.length, 0);
});

test('compaction preserves message identity for kept messages', (t) => {
  const messages = [
    { role: 'user', content: 'A', id: 1 },
    { role: 'assistant', content: 'B', ephemeral: true, id: 2 },
    { role: 'user', content: 'C', id: 3 },
  ];

  const result = ephemeral({ messages });

  assert.strictEqual(result.messages[0].id, 1);
  assert.strictEqual(result.messages[1].id, 3);
});

test('compaction returns same reference when nothing to drop', (t) => {
  const messages = [
    { role: 'user', content: 'Hello' },
  ];

  const result = ephemeral({ messages });

  assert.strictEqual(result.messages.length, 1);
  assert.strictEqual(result.messages[0].content, 'Hello');
});