const { Logger } = require('../../util.js');

const tool_error = ({ messages }) => {
  // Short-circuit if no messages (undefined/null) - return undefined
  if (!messages || !messages.length) {
    Logger.log(`tool_error: skipped (no messages)`);
    return;
  }
  
  let userSeen = 0;
  
  // Go backwards from the end (most recent first)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    
    if (msg.role === 'user') userSeen++;
    
    // Only process tool messages
    if (msg.role !== 'tool') continue;
    
    // Check if content starts with "Error:"
    if (!msg.content || !msg.content.length || !msg.content.startsWith('Error:'))
      continue;
    
    // Check if this is a bash permission hint error
    const isBashHint = msg.content.includes('use ') && msg.content.endsWith('tool instead');
    const threshold = isBashHint ? 3 : 2;
    
    // If threshold or more user messages in the past, replace content
    if (userSeen >= threshold) {
      Logger.log(`tool_error: compaction (tool=${msg.tool_name}, userSeen=${userSeen}, threshold=${threshold}${isBashHint ? ' [BASH HINT]' : ''})`);
      msg.content = '[Error]';
    }
  }
  
  Logger.log(`tool_error: returning (processed ${messages.length} messages)`);
  return { messages };
};

module.exports = tool_error;