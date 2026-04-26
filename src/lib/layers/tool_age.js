const { Logger } = require('../../util.js');

const tool_age = ({ messages, tools, limits }) => {
  // Tools without TTL or with TTL=null should not be affected
  if (!tools || !tools.length) {
    Logger.log(`tool_age: skipped (no tools)`);
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
    
    // Get TTL: prefer limit over tool's TTL, tool's TTL falls back to limit's default of 0
    let ttl = toolConfig.ttl;
    if (limits.tool_age !== undefined) {
      // limits.tool_age overrides tool TTL
      ttl = limits.tool_age;
    }
    
    // If tool has no TTL (null or 0) or no limit set, skip this tool
    if (!ttl) continue;
    
    // Find the preceding user message for this tool
    let j = i - 1;
    while (j >= 0 && messages[j].role !== 'user') {
      j--;
    }
    
    // Calculate distance from preceding user message
    if (j < 0) {
      // No preceding user message, keep the tool result
      continue;
    }
    
    const distance = i - j;
    
    // If distance is within TTL, keep the tool result
    if (distance <= ttl) {
      continue;
    }
    
    // Distance exceeds TTL, replace tool content with placeholder
    Logger.log(`tool_age: compaction (tool=${msg.name}, distance=${distance}, ttl=${ttl})`);
    msg.content = `[Old tool result content cleared for tool: ${msg.name}]`;
  }
  
  Logger.log(`tool_age: returning (processed ${len} messages)`);
  return { messages };
};

module.exports = tool_age;