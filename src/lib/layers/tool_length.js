const { Logger } = require('../../util.js');

const TRIM_MSG = '[...trimmed tool output...]';
const WAIT_UNTIL_USER_TURNS = 1;
const MAX_LONG_TOOLS_WITHOUT_USER = 5;

const tool_length = ({ messages, tools }) => {
  // Short-circuit if no messages (undefined/null) - return undefined
  if (!messages || !messages.length) {
    Logger.log(`tool_length: skipped (no messages)`);
    return;
  }
  
  let len = messages.length, userSeen = 0, longTools = 0;
  
  // Go backwards from the end (most recent first)
  for (let i = len - 1; i >= 0; i--) {
    const msg = messages[i];
    
    if (msg.role === 'user') userSeen++;
    
    // Skip non-tool messages
    if (msg.role !== 'tool'
        || (userSeen < WAIT_UNTIL_USER_TURNS
            && longTools < MAX_LONG_TOOLS_WITHOUT_USER))
      continue;
    
    // Get tool config for this tool
    const toolConfig = tools[msg.name];
    
    // Skip if no tool config
    if (!toolConfig) continue;
    
    // Get tool length limit from config, default to 400 if not specified
    let maxLength = toolConfig.maxLength || 400;
    
    // If tool response exceeds maxLength, truncate to keep only middle third
    if (msg.content.length > maxLength) {
      longTools++;
      const originalContent = msg.content;
      const originalLength = originalContent.length;
      
      // Calculate the middle third boundaries
      const thirdLength = Math.floor(originalLength / 3);
      const startIdx = thirdLength;
      const endIdx = originalLength - thirdLength;
      
      const middleContent = originalContent.substring(startIdx, endIdx);
      
      // If truncation is needed, replace content with truncated version
      const trimmedContent = `${TRIM_MSG}\n${middleContent.substring(0, maxLength)}\n${TRIM_MSG}`;
      Logger.log(`tool_length: trimming from ${msg.content.length} to ${trimmedContent.length})`);
      msg.content = trimmedContent;
    }
  }
  
  Logger.log(`tool_length: returning (processed ${len} messages)`);
  return { messages };
};

module.exports = tool_length;