const { Logger } = require('../../util.js');

const tool_redundancy = ({ messages }) => {
  if (!messages) {
    Logger.log(`tool_redundancy: skipped (no messages)`);
    return;
  }
  Logger.log(`tool_redundancy: called (messages=${messages.length})`);
  Logger.log(`tool_redundancy: returning (processed ${messages.length} messages)`);
  return { messages };
};

module.exports = tool_redundancy;