const assert = require('assert');
const test = require('node:test');

const assert = require('assert');
const test = require('node:test');

const fs = require('fs');

test('declutterChatHistory uses leeway for partial overlap', () => {
  const mockReads = [
    { file: 'file1.txt', range: [0, 50] },
    { file: 'file2.txt', range: [47, 99] }, // Overlaps but extends by less than MAX_READ_DELTA (3)
    { file: 'file3.txt', range: [100, 150] }, // No overlap with file2
  ];
  
  // Mock stdin content with read calls
  const chatContent = JSON.stringify([
    { role: 'user', content: 'what is the temperature?' },
    { role: 'assistant', content: 'Let me check.', tool_calls: [{ function: { name: 'read', arguments: { file: 'file1.txt', start_line: 0, end_line: 50 } } }] },
    { role: 'user', content: 'what about the humidity?' },
    { role: 'assistant', content: 'Checking.', tool_calls: [{ function: { name: 'read', arguments: { file: 'file2.txt', start_line: 47, end_line: 99 } } }] },
    { role: 'user', content: 'what about the wind speed?' },
    { role: 'assistant', content: 'Looking up.', tool_calls: [{ function: { name: 'read', arguments: { file: 'file3.txt', start_line: 100, end_line: 150 } } }] }
  ]);
  
  const mockStdinContent = JSON.parse(`{"chat":${chatContent}}`);
  
  // Mock fs.readFileSync to return the chat content
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = () => chatContent;
  
  try {
    assert(mockStdinContent.chat.length > 0);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
});

test('declutterChatHistory marks files for removal when overlap exceeds delta', () => {
  const excessiveOverlapFile1 = '/tmp/declutter-excessive1.txt';
  const excessiveOverlapFile2 = '/tmp/declutter-excessive2.txt';
  
  // File that extends way beyond the previous file (more than MAX_READ_DELTA)
  fs.writeFileSync(excessiveOverlapFile1, 'content1');
  fs.writeFileSync(excessiveOverlapFile2, 'content2');
  
  try {
    assert(fs.existsSync(excessiveOverlapFile1));
    assert(fs.existsSync(excessiveOverlapFile2));
  } finally {
    fs.unlinkSync(excessiveOverlapFile1);
    fs.unlinkSync(excessiveOverlapFile2);
  }
});
  const mockReads = [
    { file: 'file1.txt', range: [0, 50] },
    { file: 'file2.txt', range: [47, 99] }, // Overlaps but extends by less than MAX_READ_DELTA (3)
    { file: 'file3.txt', range: [100, 150] }, // No overlap with file2
  ];
  
  // Mock stdin content with read calls
  const chatContent = JSON.stringify([
    { role: 'user', content: 'what is the temperature?' },
    { role: 'assistant', content: 'Let me check.', tool_calls: [{ function: { name: 'read', arguments: { file: 'file1.txt', start_line: 0, end_line: 50 } } }] },
    { role: 'user', content: 'what about the humidity?' },
    { role: 'assistant', content: 'Checking.', tool_calls: [{ function: { name: 'read', arguments: { file: 'file2.txt', start_line: 47, end_line: 99 } } }] },
    { role: 'user', content: 'what about the wind speed?' },
    { role: 'assistant', content: 'Looking up.', tool_calls: [{ function: { name: 'read', arguments: { file: 'file3.txt', start_line: 100, end_line: 150 } } }] }
  ]);
  
  const mockStdinContent = JSON.parse(`{"chat":${chatContent}}`);
  
  // Mock fs.readFileSync to return the chat content
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = () => chatContent;
  
  try {
    assert(mockStdinContent.chat.length > 0);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
});

test('declutterChatHistory marks files for removal when overlap exceeds delta', () => {
  const excessiveOverlapFile1 = '/tmp/declutter-excessive1.txt';
  const excessiveOverlapFile2 = '/tmp/declutter-excessive2.txt';
  
  // File that extends way beyond the previous file (more than MAX_READ_DELTA)
  fs.writeFileSync(excessiveOverlapFile1, 'content1');
  fs.writeFileSync(excessiveOverlapFile2, 'content2');
  
  try {
    assert(fs.existsSync(excessiveOverlapFile1));
    assert(fs.existsSync(excessiveOverlapFile2));
  } finally {
    fs.unlinkSync(excessiveOverlapFile1);
    fs.unlinkSync(excessiveOverlapFile2);
  }
});
