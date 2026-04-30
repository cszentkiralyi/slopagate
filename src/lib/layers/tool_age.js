const { Logger } = require('../../util.js');

const tool_age = ({ messages, config }) => {
  Logger.log(`[tool_age] Starting on ${messages.length} messages`);
  let time, m, idx = null;
  for (i = messages.length - 1; i >= 0; i--) {
    if (!(m = messages[i]) || m.role !== 'tool') continue;
    if (time == config.ttl) {
      Logger.log(`[tool_age] TTL of ${config.ttl} reached at index ${i}`);
      idx = i; 
      break;
    }
    time++;
  }
  if (idx) {
    Logger.log(`[tool_age] removing tools forward to ${i}`);
    let ret = [], i;
    for (i = 0; i <= idx;) {
      if (!messages[i] || messages[i].role === 'tool')
        continue;
      if (messages[i].tool_calls) {
        m = { ...(messages[i++]) };
        delete m.tool_calls;
        ret.push(m);
      } else {
        ret.push(messages[i++]);
      }
    }
    ret.push(...(messages.slice(idx + 1)));
    Logger.log(`[tool_age] Done, returning ${ret.length} messages`);
    return { messages: ret };
  }
  return;
}

/*
const WAIT_UNTIL_USER_TURNS = 1;

const tool_age_old = ({ messages, tools, limits }) => {
  if (!tools || !tools.length) {
    Logger.log(`tool_age: skipped (no tools)`);
    return { messages };
  }

  let len = messages.length;
  let userCounter = 0;
  let toolCounts = {};

  for (let i = len - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.role === 'user') {
      userCounter++;
      if (userCounter < WAIT_UNTIL_USER_TURNS) continue;
    }

    if (msg.role === 'tool') {
      const toolConfig = tools[msg.name];
      if (!toolConfig) continue;

      let ttl = toolConfig.ttl;
      if (limits.tool_age !== undefined) ttl = limits.tool_age;
      if (!ttl) continue;

      toolCounts[msg.name] = (toolCounts[msg.name] || 0) + 1;

      if (userCounter >= WAIT_UNTIL_USER_TURNS && toolCounts[msg.name] > ttl) {
        Logger.log(`tool_age: compaction (tool=${msg.name}, count=${toolCounts[msg.name]}, ttl=${ttl})`);
        msg.content = `[Old tool result content cleared for tool: ${msg.name}]`;
      }
    }
  }

  Logger.log(`tool_age: returning (processed ${len} messages)`);
  return { messages };
};
*/

module.exports = tool_age;