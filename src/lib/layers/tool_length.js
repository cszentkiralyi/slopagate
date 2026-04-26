const { Logger } = require('../../util.js');

const TRIM_MSG = '[...trimmed tool output...]';

const tool_length = ({ messages, tools }) => {
  // Short-circuit if no messages (undefined/null) - return undefined
  if (!messages) {
    Logger.log(`tool_length: skipped (no messages)`);
    return;
  }
  
  // Return empty array object for empty array
  if (!messages.length) {
    Logger.log(`tool_length: skipped (empty messages)`);
    return { messages };
  }
  
  let len = messages.length;
  
  // Go backwards from the end (most recent first)
  for (let i = len - 1; i >= 0; i--) {
    const msg = messages[i];
    
    // Skip non-tool messages
    if (msg.role !== 'tool') continue;
    
    // Get tool config for this tool
    const toolConfig = tools[msg.name];
    
    // Skip if no tool config
    if (!toolConfig) continue;
    
    // Get tool length limit from config, default to 2000 if not specified
    let maxLength = toolConfig.maxLength;
    if (maxLength === undefined) {
      maxLength = 2000;
    }
    
    // If tool response exceeds maxLength, truncate to keep only middle third
    if (msg.content.length > maxLength) {
      const originalContent = msg.content;
      const originalLength = originalContent.length;
      
      // Calculate the middle third boundaries
      const thirdLength = Math.floor(originalLength / 3);
      const startIdx = thirdLength;
      const endIdx = originalLength - thirdLength;
      
      const middleContent = originalContent.substring(startIdx, endIdx);
      
      // If truncation is needed, replace content with truncated version
      const trimmedContent = `${TRIM_MSG}\n${middleContent.substring(0, maxLength)}\n${TRIM_MSG}`;
      msg.content = trimmedContent;
    }
  }
  
  Logger.log(`tool_length: returning (processed ${len} messages)`);
  return { messages };
};

module.exports = tool_length;