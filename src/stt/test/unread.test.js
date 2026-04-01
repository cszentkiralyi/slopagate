const assert = require('assert');
const test = require('node:test');
const fs = require('fs');

const { unreadChatHistory } = require('../unread.js');

const jsonForUnread = (arr) => {
  if (! arr instanceof Array) throw Error('jsonForUnread can only work with arrays!');
  let s = JSON.stringify(arr);
  return s.substring(1, s.length - 2);
};
const jsonFromUnread = (s) => JSON.parse(`[${s}]`);

test('unread doesn\'t affect normal chat', () => {
  const inputArr = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'user message' },
    { role: 'assistant', content: 'assistant reply' },
    { role: 'user', content: 'user message' },
    { role: 'assistant', content: 'assistant reply' },
    { role: 'user', content: 'user message' },
    { role: 'assistant', content: 'assistant reply' },
  ];
  const inputStr = jsonForUnread(inputArr);
  // TODO: when unreadChatHistory() reads stdin, return inputStr instead of actual stdin
  // TODO: when unreadChatHistory() writes stdout, capture that to outputStr instead of actual stdout
  const outputArr = jsonFromUnread(outputStr);
  
  
  assert(inputArr.length === outputArr.length);
  assert(inputArr.every((m, i) => m.role === outputArr[i].role && m.content === outputArr[i].content));
});


test('unread leaves alone non-overlapping reads', () => {

});


test('unread removes ranges and keeps whole-file reads',  () => {

});


test('unread removes smaller ranges', () => {

});


test('unread doesn\'t touch the last tool call/response', () => {

});