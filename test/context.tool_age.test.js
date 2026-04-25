const Context = require('../src/lib/context.js');
const test = require('node:test');

// Test 1: Tool responses within TTL are preserved
test('tool_age preserves tool responses within TTL', async (t) => {
  t.plan(2);
  
  const tools = {
    tool1: { ttl: 5 },
    tool2: { ttl: 3 }
  };
  
  const context = new Context({
    tools,
    limits: { tool_age: 3 }
  });
  
  // Add messages: user, tool1, tool2, user, tool1, user, tool1, tool2
  context.add({ role: 'user', content: 'First user message' });
  context.add({ role: 'tool', name: 'tool1', content: 'Tool 1 result 1' });
  context.add({ role: 'tool', name: 'tool2', content: 'Tool 2 result 1' });
  context.add({ role: 'user', content: 'Second user message' });
  context.add({ role: 'tool', name: 'tool1', content: 'Tool 1 result 2' });
  context.add({ role: 'user', content: 'Third user message' });
  context.add({ role: 'tool', name: 'tool1', content: 'Tool 1 result 3' });
  context.add({ role: 'tool', name: 'tool2', content: 'Tool 2 result 2' });
  
  // Compact with tool_age layer
  context.compact(['tool_age']);
  
  t.assert.equal(
    context.messages[0].content,
    'First user message',
    'User message should be preserved'
  );
  t.assert.equal(
    context.messages[6].content,
    '[Old tool result content cleared]',
    'tool1 at distance 3 from user should be cleared (TTL=3)'
  );
});

// Test 2: Tool responses beyond TTL are cleared
test('tool_age clears tool responses beyond TTL', async (t) => {
  t.plan(1);
  
  const tools = {
    myTool: { ttl: 2 }
  };
  
  const context = new Context({
    tools,
    limits: { tool_age: 2 }
  });
  
  context.add({ role: 'user', content: 'User 1' });
  context.add({ role: 'tool', name: 'myTool', content: 'Result 1' });
  context.add({ role: 'user', content: 'User 2' });
  context.add({ role: 'tool', name: 'myTool', content: 'Result 2' });
  context.add({ role: 'user', content: 'User 3' });
  context.add({ role: 'tool', name: 'myTool', content: 'Result 3' });
  
  context.compact(['tool_age']);
  
  t.assert.equal(
    context.messages[5].content,
    '[Old tool result content cleared]',
    'Tool result beyond TTL should be cleared'
  );
});

// Test 3: Tools without TTL or with TTL=null should not be affected
test('tool_age ignores tools without TTL', async (t) => {
  t.plan(1);
  
  const tools = {
    alwaysFresh: { ttl: null },
    hasTtl: { ttl: 1 }
  };
  
  const context = new Context({
    tools,
    limits: { tool_age: 1 }
  });
  
  context.add({ role: 'user', content: 'User 1' });
  context.add({ role: 'tool', name: 'alwaysFresh', content: 'Always fresh result' });
  context.add({ role: 'user', content: 'User 2' });
  context.add({ role: 'tool', name: 'hasTtl', content: 'Has TTL result' });
  
  context.compact(['tool_age']);
  
  t.assert.equal(
    context.messages[3].content,
    'Always fresh result',
    'Tool with null TTL should not be cleared'
  );
});

// Test 4: When no tools or tools array is empty
test('tool_age returns early when no tools', async (t) => {
  t.plan(1);
  
  const context = new Context({
    tools: [],
    limits: { tool_age: 2 }
  });
  
  context.add({ role: 'user', content: 'User 1' });
  context.add({ role: 'tool', name: 'anyTool', content: 'Result' });
  
  context.compact(['tool_age']);
  
  t.assert.equal(
    context.messages[1].content,
    'Result',
    'Tool result should be preserved when tools array is empty'
  );
});

// Test 5: Tool_age limit overrides tool TTL
test('tool_age limit can override tool TTL', async (t) => {
  t.plan(1);
  
  const tools = {
    myTool: { ttl: 5 }
  };
  
  const context = new Context({
    tools,
    limits: { tool_age: 3 } // This should be used instead of tool.ttl
  });
  
  context.add({ role: 'user', content: 'User 1' });
  context.add({ role: 'tool', name: 'myTool', content: 'Result 1' });
  context.add({ role: 'user', content: 'User 2' });
  context.add({ role: 'tool', name: 'myTool', content: 'Result 2' });
  context.add({ role: 'user', content: 'User 3' });
  context.add({ role: 'tool', name: 'myTool', content: 'Result 3' });
  
  context.compact(['tool_age']);
  
  // With tool_age: 3, result 3 should be cleared (distance from user is 3)
  t.assert.equal(
    context.messages[5].content,
    '[Old tool result content cleared]',
    'tool_age limit should override tool TTL'
  );
});