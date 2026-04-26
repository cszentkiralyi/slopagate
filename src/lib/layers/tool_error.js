const { Logger } = require('../../util.js');

const tool_error = ({ messages }) => {
  // Short-circuit if no messages (undefined/null) - return undefined
  if (!messages) {
    Logger.log(`tool_error: skipped (no messages)`);
    return;
  }
  // Return empty array object for empty array
  if (!messages.length) {
    Logger.log(`tool_error: skipped (empty messages)`);
    return { messages };
  }
  
  // Go backwards from the end (most recent first)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    
    // Only process tool messages
    if (msg.role !== 'tool') continue;
    
    // Check if content starts with "Error:"
    if (!msg.content.startsWith('Error:')) continue;
    
    // Count user messages between this error and the next error (going forward)
    let userCount = 0;
    let j = i + 1;
    while (j < messages.length) {
      if (messages[j].role === 'user') {
        userCount++;
        j++;
      } else if (messages[j].role === 'tool') {
        break;
      } else {
        j++;
      }
    }
    
    // If 2 or more user messages in the past, replace content
    if (userCount >= 2) {
      Logger.log(`tool_error: compaction (tool=${msg.name}, userCount=${userCount})`);
      msg.content = '[Error]';
    }
  }
  
  Logger.log(`tool_error: returning (processed ${messages.length} messages)`);
  return { messages };
};

module.exports = tool_error;