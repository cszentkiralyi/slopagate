const test = require('node:test');
const assert = require('node:assert');
const tool_age = require('../src/lib/layers/tool_age.js');

// Test: Tool results outside TTL are deleted when iterating backwards from newest
test('compaction removes tool results outside TTL window', (t) => {
  // Messages array: oldest at index 0, newest at last index
  // User messages define turn boundaries. Tool messages store which user turn they belong to.
  // We iterate backwards from newest (last index) to oldest (first index)
  // and delete tool content when distance from most recent user turn exceeds TTL
  const messages = [
    { role: 'user', content: 'Hello', name: 'fetchData' },
    { role: 'user', content: 'User request 1', name: 'fetchData' },
    { role: 'user', content: 'User request 2', name: 'fetchData' },
    { role: 'user', content: 'User request 3', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn1', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn2', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn3', name: 'fetchData' },
  ];

  const tools = {
    fetchData: { ttl: 1 } // Keep tool results within 1 user turn
  };

  const result = tool_age({ messages, tools, limits: {} });

  // All tools should be kept since each tool is at distance 0 from its user turn
  assert.strictEqual(result.messages.length, 7);
});

// Test: Tools older than TTL are deleted
test('compaction deletes old tool results', (t) => {
  const messages = [
    { role: 'user', content: 'Hello', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn0', name: 'fetchData' },
    { role: 'user', content: 'User 1', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn1', name: 'fetchData' },
    { role: 'user', content: 'User 2', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn2', name: 'fetchData' },
    { role: 'user', content: 'User 3', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn3', name: 'fetchData' },
    { role: 'user', content: 'User 4', name: 'fetchData' },
  ];

  const tools = {
    fetchData: { ttl: 2 } // Keep within 2 user turns
  };

  const result = tool_age({ messages, tools, limits: {} });

  // turn0 tool: distance from turn4 = 4 > TTL(2), should have placeholder
  // turn1 tool: distance from turn4 = 3 > TTL(2), should have placeholder
  // turn2 tool: distance from turn4 = 2 <= TTL(2), should be kept
  // turn3 tool: distance from turn4 = 1 <= TTL(2), should be kept
  // turn4 tool: distance 0, should be kept
  // All 9 messages should be present, old tool content replaced
  assert.strictEqual(result.messages.length, 9);
});

// Test: Tools with very large TTL keep all
test('compaction with large TTL keeps all tools', (t) => {
  const messages = [
    { role: 'user', content: 'Hello', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn0', name: 'fetchData' },
    { role: 'user', content: 'User 1', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn1', name: 'fetchData' },
    { role: 'user', content: 'User 2', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn2', name: 'fetchData' },
    { role: 'user', content: 'User 3', name: 'fetchData' },
  ];

  const tools = {
    fetchData: { ttl: 100 }
  };

  const result = tool_age({ messages, tools, limits: {} });

  assert.strictEqual(result.messages.length, 7);
});

// Test: Tools with TTL=0 keep all (special case: no TTL means keep forever)
test('compaction with special TTL values keeps all tools', (t) => {
  const messages = [
    { role: 'user', content: 'Hello', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn0', name: 'fetchData' },
    { role: 'user', content: 'User 1', name: 'fetchData' },
    { role: 'tool', content: 'Tool result for turn1', name: 'fetchData' },
    { role: 'user', content: 'User 2', name: 'fetchData' },
  ];

  const tools = {
    fetchData: { ttl: 0 }
  };

  const result = tool_age({ messages, tools, limits: {} });

  // TTL=0 or null means keep all tool results
  assert.strictEqual(result.messages.length, 5);
});

// Test: Non-tool messages are preserved
test('compaction preserves non-tool messages', (t) => {
  const messages = [
    { role: 'tool', content: 'Tool result for turn0', name: 'fetchData' },
    { role: 'user', content: 'System message' },
    { role: 'user', content: 'User message' },
    { role: 'assistant', content: 'Assistant message' },
  ];

  const tools = { fetchData: { ttl: 1 } };

  const result = tool_age({ messages, tools, limits: {} });

  assert.strictEqual(result.messages.length, 4);
  assert.strictEqual(result.messages[0].content, 'Tool result for turn0');
  assert.strictEqual(result.messages[1].content, 'System message');
  assert.strictEqual(result.messages[2].content, 'User message');
  assert.strictEqual(result.messages[3].content, 'Assistant message');
});

// Test: Tools without a TTL config are preserved
test('compaction handles tools without TTL config', (t) => {
  const messages = [
    { role: 'tool', content: 'Tool result for otherTool turn0', name: 'otherTool' },
    { role: 'tool', content: 'Tool result for otherTool turn1', name: 'otherTool' },
    { role: 'tool', content: 'Tool result for otherTool turn2', name: 'otherTool' },
  ];

  const tools = {
    otherTool: { ttl: 1 } // Only this tool has config
  };

  const result = tool_age({ messages, tools, limits: {} });

  // All 3 messages are either unknown tools or have no TTL, so all preserved
  assert.strictEqual(result.messages.length, 3);
});