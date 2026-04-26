const test = require('node:test');
const assert = require('node:assert');
const chat_summary = require('../src/lib/layers/chat_summary');

const messages = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there' },
  { role: 'user', content: 'How are you?' },
  { role: 'assistant', content: 'I am good' },
  { role: 'user', content: 'What is the weather?' },
  { role: 'assistant', content: 'I do not know' },
];

const summaryCallback = async (transcript) => `Summary of transcript: ${transcript}`;
const toTranscript = (m) => `${m.role}: ${m.content}`;

test('returns as-is if fewer than 4 messages', async (t) => {
  const shortMessages = [
    { role: 'user', content: 'A' },
    { role: 'assistant', content: 'B' },
  ];

  const result = await chat_summary({
    messages: shortMessages,
    requestSummary: summaryCallback,
    toTranscript: toTranscript,
  });

  t.assert.strictEqual(result.messages, shortMessages);
});

test('skips 4 most recent and finds assistant in remaining', async (t) => {
  const longMessages = [
    { role: 'user', content: '1' },
    { role: 'assistant', content: '2' },
    { role: 'user', content: '3' },
    { role: 'assistant', content: '4' },
    { role: 'user', content: '5' },
    { role: 'assistant', content: '6' },
    { role: 'user', content: '7' },
    { role: 'assistant', content: '8' },
    { role: 'user', content: '9' },
    { role: 'assistant', content: '10' },
  ];

  const result = await chat_summary({
    messages: longMessages,
    requestSummary: summaryCallback,
    toTranscript: toTranscript,
  });

  // Should return compacted array with summary + replacement + last 4 messages
  t.assert.strictEqual(result.messages.length, 6);
  t.assert.strictEqual(result.messages[0].role, 'user');
  t.assert.strictEqual(result.messages[1].role, 'assistant');
  t.assert.strictEqual(result.messages[1].content, 'Thank you, now I have the context I need to continue.');
  t.assert.strictEqual(result.messages[2].role, 'user');
  t.assert.strictEqual(result.messages[2].content, '7');
});

test('returns as-is if no assistant found in summarize range', async (t) => {
  const noAssistantMessages = [
    { role: 'user', content: '1' },
    { role: 'user', content: '2' },
    { role: 'user', content: '3' },
    { role: 'user', content: '4' },
    { role: 'user', content: '5' },
  ];

  const result = await chat_summary({
    messages: noAssistantMessages,
    requestSummary: summaryCallback,
    toTranscript: toTranscript,
  });

  t.assert.strictEqual(result.messages, noAssistantMessages);
});