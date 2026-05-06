const { Logger } = require('../../util.js');
const Tool = require('../../tools/tool.js');

const tool_total = ({ messages, config, context_window }) => {
  let maxBytes = (config.max > 1) ? config.max : (config.max * context_window * 3.5),
      total = 0,
      trimIdx = -1;

  // Walk backwards, summing tool response lengths
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'tool') {
      total += (messages[i].content || '').length;
      if (total > maxBytes && trimIdx === -1) {
        trimIdx = i;
      }
    }
  }

  // If we need to trim, replace older tool responses
  if (trimIdx !== -1) {
    Logger.log(`[tool_total] exceeded ${maxBytes} bytes at index ${trimIdx}`);
    const ret = [ ...messages ];
    for (let i = 0; i <= trimIdx; i++) {
      if (ret[i].role === 'tool') {
        ret[i] = { ...ret[i], content: Tool.TRIM_MSG };
        Logger.log(`[tool_total] trimmed tool response at index ${i}`);
      }
    }
    return { messages: ret };
  }

  return { messages };
};

module.exports = tool_total;
