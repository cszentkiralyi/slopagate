const { Logger } = require('../../util.js');

const chat_importance = ({ messages }) => {
  if (!messages) {
    Logger.log(`chat_importance: skipped (no messages)`);
    return;
  }
  Logger.log(`chat_importance: called (messages=${messages.length})`);
  Logger.log(`chat_importance: returning (no compaction)`);
  return { messages };
};

module.exports = chat_importance;