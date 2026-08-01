
const test = require('node:test');
const assert = require('node:assert');
const chat_score = require('../src/lib/layers/chat_score.js');

// The real API returns { messages: [...] } — a flat array of collapsed user messages
// followed by their assistant blocks. No turn structure is exposed.

test('returns empty array for empty messages', () => {
  const result = chat_score({ messages: [], config: {}, budget: {} });
  assert.deepStrictEqual(result.messages, []);
});

test('preserves user-then-assistant order for a single turn', () => {
  const result = chat_score({
    messages: [
      { role: 'user', content: 'Hello', tokenCount: 5 },
      { role: 'assistant', content: 'Hi!', tokenCount: 3 }
    ],
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  assert.strictEqual(result.messages.length, 2);
  assert.strictEqual(result.messages[0].content, 'Hello');
  assert.strictEqual(result.messages[1].content, 'Hi!');
});

test('collapses consecutive user messages joined by double newline', () => {
  const result = chat_score({
    messages: [
      { role: 'user', content: 'A', tokenCount: 2 },
      { role: 'user', content: 'B', tokenCount: 2 },
      { role: 'assistant', content: 'Answer', tokenCount: 4 }
    ],
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  // Two consecutive users in same turn should be collapsed; assistant follows
  assert.strictEqual(result.messages.length, 2);
  assert.strictEqual(result.messages[0].content, 'A\n\nB');
  assert.strictEqual(result.messages[0].tokenCount, 4);
  assert.strictEqual(result.messages[1].content, 'Answer');
});

test('only includes turns whose cumulative size fits the stub budget', () => {
  const messages = [];
  for (let i = 0; i < 50; i++) {
    messages.push({ role: 'user', content: `U${i}`, tokenCount: 10 });
    messages.push({ role: 'assistant', content: `A${i}`, tokenCount: 10 });
  }
  const result = chat_score({
    messages,
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  // stub budget = 4096 * 0.55 * 0.1 = ~225; each turn ~20 tokens => ~11 turns max
  const totalTokens = result.messages.reduce((s, m) => s + (m.tokenCount || 0), 0);
  assert.ok(totalTokens <= 225 * 1.1);
  assert.ok(result.messages.length > 0 && result.messages.length < messages.length);
});

test('excludes turns that don\'t fit the stub budget', () => {
  const messages = [];
  for (let i = 0; i < 100; i++) {
    messages.push({ role: 'user', content: `U${i}`, tokenCount: 20 });
    messages.push({ role: 'assistant', content: `A${i}`, tokenCount: 20 });
  }
  const result = chat_score({
    messages,
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  // Total tokens = 4000; stub budget ~225; only a fraction should remain
  assert.ok(result.messages.length < messages.length);
});

test('ignores assistant messages without a preceding user message', () => {
  const result = chat_score({
    messages: [
      { role: 'assistant', content: 'orphan response', tokenCount: 8 },
      { role: 'user', content: 'real question', tokenCount: 5 },
      { role: 'assistant', content: 'real answer', tokenCount: 6 }
    ],
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  // Orphan assistant ignored; turn (user+assistant) included
  assert.strictEqual(result.messages.length, 2);
  assert.strictEqual(result.messages[0].content, 'real question');
});

test('includes trailing user message even with no assistant follow-up', () => {
  const result = chat_score({
    messages: [
      { role: 'user', content: 'Hi', tokenCount: 3 },
      { role: 'assistant', content: 'Hello', tokenCount: 4 },
      { role: 'user', content: 'Follow up', tokenCount: 5 }
    ],
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  // Both turns fit the stub budget and inflate to full; trailing user preserved at end
  assert.strictEqual(result.messages.length, 3);
  assert.strictEqual(result.messages[1].content, 'Hello');
});

test('selected turns appear in descending score order (newest first)', () => {
  const result = chat_score({
    messages: [
      // Turn A (old)
      { role: 'user', content: 'Old Q1', tokenCount: 5, importance: 0.1 },
      { role: 'assistant', content: 'Old A1', tokenCount: 5, importance: 0.1 },
      // Turn B (new)
      { role: 'user', content: 'New Q2', tokenCount: 5, importance: 0.9 },
      { role: 'assistant', content: 'New A2', tokenCount: 5, importance: 0.9 }
    ],
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  // Both fit; high-scoring turn B first
  assert.strictEqual(result.messages[0].content, 'New Q2');
});

test('includes tool messages as part of the turn\'s assistant block', () => {
  const result = chat_score({
    messages: [
      { role: 'user', content: 'Do thing', tokenCount: 4 },
      { role: 'assistant', content: 'calling tool', tokenCount: 5 },
      { role: 'tool', content: '{result}', tokenCount: 6 }
    ],
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  assert.strictEqual(result.messages.length, 3);
  assert.strictEqual(result.messages[2].content, '{result}');
});

test('collapsed user message sums token counts of originals', () => {
  const result = chat_score({
    messages: [
      { role: 'user', content: 'X', tokenCount: 10 },
      { role: 'user', content: 'Y', tokenCount: 15 },
      { role: 'assistant', content: 'Z', tokenCount: 7 }
    ],
    context_window: 4096,
    config: { threshold: 0 },
    budget: { target_saturation: 0.55, available: 1000 }
  });
  assert.strictEqual(result.messages[0].tokenCount, 25); // 10 + 15
});
