const { Logger } = require('../../util.js');

const chat_summary = ({ messages }) => {
  Logger.log(`chat_summary: running, ${messages.length} messages`);

  // Find most-recent summary message
  let summaryIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'summary') {
      summaryIndex = i;
      break;
    }
  }

  // No summary found — return as-is
  if (summaryIndex === -1) {
    return { messages };
  }

  // Drop all older messages, change summary role to user
  const ret = messages.slice(summaryIndex).map((m, i) =>
    i === 0 ? { ...m, role: 'user' } : m
  );

  Logger.log(`chat_summary: compacted (kept ${ret.length} messages from summary onwards)`);
  return { messages: ret };
};

module.exports = chat_summary;