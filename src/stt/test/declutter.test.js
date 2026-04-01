const assert = require('assert');
const test = require('node:test');

const { declutterChatHistory } = require('../declutter.js');

test('declutterChatHistory passes with short chat history', () => {
  const originalReadFileSync = require('fs').readFileSync;
  
  // Mock fs.readFileSync to return a chat array shorter than MIN_HISTORY_LENGTH (8)
  require('fs').readFileSync = () => JSON.stringify([
    { role: 'user', content: 'test' },
    { role: 'assistant', content: 'response' }
  ]);
  
  try {
    // Should return early when chat history is too short, without logging anything
    const result = declutterChatHistory({});
    
    // Assert function returns early with status code (not a number)
    assert(result !== undefined);
    assert(typeof result === 'number');
  } finally {
    // Restore original readFileSync
    require('fs').readFileSync = originalReadFileSync;
  }
});
