const test = require('node:test');
const assert = require('node:assert');
const Context = require('../src/lib/context.js');

test('Context.fork with tool_age layer culls old tool results', async (t) => {
  // tool_age counts tool occurrences (not turns). With ttl=1, only the 
  // first tool result seen (newest, since we iterate backwards) survives.
  const ctx = new Context({
    tools: { fetchData: { ttl: 1 } },
    messages: [
      { role: 'user', content: 'Start' },
      { role: 'assistant', content: 'ok' },
      { role: 'tool', content: 'Result A', name: 'fetchData' },
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'ok' },
      { role: 'tool', content: 'Result B', name: 'fetchData' },
      { role: 'user', content: 'q2' },
      { role: 'assistant', content: 'ok' },
      { role: 'tool', content: 'Result C', name: 'fetchData' },
      { role: 'user', content: 'q3' },
      { role: 'assistant', content: 'ok' },
      { role: 'tool', content: 'Result D', name: 'fetchData' },
    ]
  });

  // Fork with ONLY the tool_age layer
  const forked = await ctx.fork({ layers: ['tool_age'] });

  // Message count should be the same (tool_age replaces in-place)
  assert.strictEqual(forked.messages.length, ctx.messages.length);

  const toolMsgs = forked.messages.filter(m => m.role === 'tool');
  assert.strictEqual(toolMsgs.length, 4);
  // Iterating backwards: D(count=1) kept, C(count=2) culled, B(count=3) culled, A(count=4) culled
  assert.strictEqual(toolMsgs[0].content.includes('Old tool result content cleared'), true,
    'Result A (count=4) should be culled');
  assert.strictEqual(toolMsgs[1].content.includes('Old tool result content cleared'), true,
    'Result B (count=3) should be culled');
  assert.strictEqual(toolMsgs[2].content.includes('Old tool result content cleared'), true,
    'Result C (count=2) should be culled');
  assert.strictEqual(toolMsgs[3].content, 'Result D',
    'Result D (count=1) should be preserved');
});

test('Context.fork with tool_age layer preserves non-tool messages', async (t) => {
  const ctx = new Context({
    tools: { fetchData: { ttl: 0 } },
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
      { role: 'tool', content: 'data', name: 'fetchData' },
      { role: 'user', content: 'bye' },
    ]
  });

  const forked = await ctx.fork({ layers: ['tool_age'] });

  assert.strictEqual(forked.messages.length, 4);
  assert.strictEqual(forked.messages[0].role, 'user');
  assert.strictEqual(forked.messages[1].role, 'assistant');
  assert.strictEqual(forked.messages[2].role, 'tool');
  assert.strictEqual(forked.messages[3].role, 'user');
});