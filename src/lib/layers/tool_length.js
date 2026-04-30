const { Logger } = require('../../util.js');

const TRIM_MSG = '[...trimmed tool output...]';
const TRIM_MSG_LEN = TRIM_MSG.length;

const trim = (s, third) => {
  return s.substring(0, third) + TRIM_MSG + s.substring(third * 2);
};

const tool_length = ({ messages, config, estimate }) => {
  let max = config.max,
      len, third, start, end, next, args, arg,
      c, i, j, k, m, t, u;
  for (i = messages.length - 1; i >= 0; i--) {
    m = messages[i];
    u = false;
    if (m.content && (len = m.content.length) > max) {
      u = true;
      third = Math.floor((len / 3) - (TRIM_MSG_LEN / 2) - 1);
      m = { ...m };
      m.message = trim(m.content, third);
    }
    if (m.tool_calls) {
      for (j = next.tools_calls.length; j >= 0; j--) {
        next = null;
        c = m.tool_calls[j];
        if (c.function.name === 'Edit'
            && (args = c.arguments)
            && Object.values(c.arguments).some(v => v.length > max)) {
          u = true;
          next = [ ...(m.tool_calls) ];
          c = { ...next.tool_calls };
          c.args = args = [ ...args ];
          next.splice(j, 1, c);
          for (k = args.length; k >= 0; k--) {
            arg = c.arguments[k];
            if (typeof arg === 'string' && (len = arg.length) > max) {
              third = Math.floor((len / 3) - (TRIM_MSG_LEN / 2) - 1);
              c.arguments[k] = trim(arg, third);
            }
          }
        }
        if (next) {
          m = { ...m };
          m.tool_calls = next;
        }
      }
    }
    
    if (u) messages.splice(i, 1, m);
  }
  
  return messages;
};

/*
const tool_length_old = ({ messages, tools }) => {
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
*/

module.exports = tool_length;