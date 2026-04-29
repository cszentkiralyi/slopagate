const test = require('node:test');
const assert = require('node:assert');
const tool_length = require('../src/lib/layers/tool_length.js');

// ===== Basic Truncation Tests =====
// Test: Tool messages exceeding maxLength are truncated to middle third
test('tool_length truncates long tool messages to middle third', (t) => {
  const longContent = 'A'.repeat(500);
  const messages = [
    { role: 'tool', content: longContent, name: 'fetchData' },
    { role: 'user', content: 'Hello' },
  ];

  const tools = {
    fetchData: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });

  assert.ok(result);
  assert.ok(result.messages);
  assert.strictEqual(result.messages.length, 2);
  
  // Content should be truncated with trim markers and middle third
  const truncated = result.messages[0].content;
  assert.ok(truncated.includes('[...trimmed tool output...]'));
  assert.ok(truncated.includes('A'.repeat(33))); // Middle third of 500 chars
  assert.ok(truncated.includes('[...trimmed tool output...]'));
});

// Test: Tool messages within maxLength are not modified
test('tool_length preserves short tool messages', (t) => {
  const shortContent = 'Short';
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'tool', content: shortContent, name: 'fetchData' },
  ];

  const tools = {
    fetchData: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });

  assert.strictEqual(result.messages[1].content, shortContent);
});

// Test: Truncation keeps exact middle third
test('tool_length calculates middle third correctly', (t) => {
  const content = '0123456789'.repeat(100); // 1000 chars
  const messages = [
    { role: 'tool', content: content, name: 'fetchData' },
    { role: 'user', content: 'Hello' },
  ];

  const tools = {
    fetchData: { maxLength: 200 }
  };

  const result = tool_length({ messages, tools });
  const truncated = result.messages[0].content;

  // Original: 1000 chars, middle third = 334 chars (indices 333-667)
  // Truncated content should be between trim markers
  const trimmedPart = truncated.substring(
    truncated.indexOf('[...trimmed tool output...]') + 27,
    truncated.lastIndexOf('[...trimmed tool output...]')
  );
  assert.strictEqual(trimmedPart.length, 202); // 2 newlines + 200 chars
  // content[333] = '3' (333 % 10), content[532] = '2' (532 % 10)
  assert.ok(trimmedPart.startsWith('\n3'));
  assert.ok(trimmedPart.endsWith('2\n'));
});

// Test: Multiple long tool messages are all truncated
test('tool_length handles multiple long tool messages', (t) => {
  const messages = [
    { role: 'tool', content: 'A'.repeat(500), name: 'tool1' },
    { role: 'user', content: 'First' },
    { role: 'tool', content: 'B'.repeat(500), name: 'tool2' },
    { role: 'user', content: 'Second' },
  ];

  const tools = {
    tool1: { maxLength: 100 },
    tool2: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });

  assert.strictEqual(result.messages.length, 4);
  assert.ok(result.messages[0].content.includes('[...trimmed tool output...]'));
  assert.ok(result.messages[2].content.includes('[...trimmed tool output...]'));
});

// Test: Mixed long and short tool messages
test('tool_length handles mixed long and short tool messages', (t) => {
  const messages = [
    { role: 'tool', content: 'Short', name: 'tool1' },
    { role: 'tool', content: 'A'.repeat(500), name: 'tool2' },
    { role: 'user', content: 'Hello' },
  ];

  const tools = {
    tool1: { maxLength: 100 },
    tool2: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });

  assert.strictEqual(result.messages[0].content, 'Short');
  assert.ok(result.messages[1].content.includes('[...trimmed tool output...]'));
});

// ===== Edge Case Tests =====
// Test: Empty messages array returns undefined
test('tool_length returns undefined for empty messages', (t) => {
  const result = tool_length({ messages: [], tools: {} });
  assert.strictEqual(result, undefined);
});

// Test: No messages returns undefined
test('tool_length returns undefined for no messages', (t) => {
  const result = tool_length({ messages: null, tools: {} });
  assert.strictEqual(result, undefined);
  const result2 = tool_length({ messages: undefined, tools: {} });
  assert.strictEqual(result2, undefined);
});

// Test: Tool without maxLength uses default of 400
test('tool_length uses default maxLength of 400', (t) => {
  const content = 'A'.repeat(500);
  const messages = [
    { role: 'tool', content: content, name: 'fetchData' },
    { role: 'user', content: 'Hello' },
  ];

  const tools = {
    fetchData: {} // No maxLength specified
  };

  const result = tool_length({ messages, tools });
  const truncated = result.messages[0].content;

  assert.ok(truncated.includes('[...trimmed tool output...]'));
});

// Test: Tool without tool config is not truncated
test('tool_length skips tools without config', (t) => {
  const content = 'A'.repeat(500);
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'tool', content: content, name: 'unknownTool' },
  ];

  const tools = {};

  const result = tool_length({ messages, tools });
  assert.strictEqual(result.messages[1].content, content);
});

// Test: Non-tool messages are not modified
test('tool_length preserves non-tool messages', (t) => {
  const messages = [
    { role: 'tool', content: 'A'.repeat(500), name: 'fetchData' },
    { role: 'user', content: 'User message' },
    { role: 'assistant', content: 'Assistant message' },
  ];

  const tools = {
    fetchData: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });

  assert.strictEqual(result.messages[0].content.includes('[...trimmed tool output...]'), true);
  assert.strictEqual(result.messages[1].content, 'User message');
  assert.strictEqual(result.messages[2].content, 'Assistant message');
});

// Test: Truncation preserves trim markers
test('tool_length uses correct trim markers', (t) => {
  const content = 'A'.repeat(500);
  const messages = [
    { role: 'tool', content: content, name: 'fetchData' },
    { role: 'user', content: 'Hello' },
  ];

  const tools = {
    fetchData: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });
  const truncated = result.messages[0].content;

  const firstMarker = truncated.indexOf('[...trimmed tool output...]');
  const lastMarker = truncated.lastIndexOf('[...trimmed tool output...]');
  
  assert.ok(firstMarker >= 0);
  assert.ok(lastMarker > firstMarker);
  assert.strictEqual(truncated.substring(firstMarker, firstMarker + 27), '[...trimmed tool output...]');
  assert.strictEqual(truncated.substring(lastMarker), '[...trimmed tool output...]');
});

// Test: Truncation respects maxLength in trimmed content
test('tool_length respects maxLength in trimmed output', (t) => {
  const content = 'A'.repeat(500);
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'tool', content: content, name: 'fetchData' },
  ];

  const tools = {
    fetchData: { maxLength: 50 } // Very short
  };

  const result = tool_length({ messages, tools });
  const truncated = result.messages[1].content;

  const trimmedPart = truncated.substring(
    truncated.indexOf('[...trimmed tool output...]') + 27,
    truncated.lastIndexOf('[...trimmed tool output...]')
  );
  assert.ok(trimmedPart.length <= 50);
});

// Test: Truncation works with very long maxLength
test('tool_length does not truncate when content is within limit', (t) => {
  const content = 'A'.repeat(100);
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'tool', content: content, name: 'fetchData' },
  ];

  const tools = {
    fetchData: { maxLength: 200 }
  };

  const result = tool_length({ messages, tools });
  assert.strictEqual(result.messages[1].content, content);
});

// Test: Tool message content is modified in-place
test('tool_length modifies messages in-place', (t) => {
  const originalContent = 'A'.repeat(500);
  const messages = [
    { role: 'tool', content: originalContent, name: 'fetchData' },
    { role: 'user', content: 'Hello' },
  ];

  const tools = {
    fetchData: { maxLength: 100 }
  };

  tool_length({ messages, tools });
  const originalRef = messages[0].content;
  
  // Content should be modified
  assert.ok(originalRef.includes('[...trimmed tool output...]'));
  assert.notStrictEqual(originalRef, originalContent);
});

// Test: Truncation with exact maxLength boundary
test('tool_length does not truncate at exact maxLength boundary', (t) => {
  const content = 'A'.repeat(100);
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'tool', content: content, name: 'fetchData' },
  ];

  const tools = {
    fetchData: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });
  assert.strictEqual(result.messages[1].content, content);
});

// Test: Truncation with content slightly over maxLength
test('tool_length truncates when content is over maxLength', (t) => {
  const content = 'A'.repeat(101);
  const messages = [
    { role: 'tool', content: content, name: 'fetchData' },
    { role: 'user', content: 'Hello' },
  ];

  const tools = {
    fetchData: { maxLength: 100 }
  };

  const result = tool_length({ messages, tools });
  assert.ok(result.messages[0].content.includes('[...trimmed tool output...]'));
});
