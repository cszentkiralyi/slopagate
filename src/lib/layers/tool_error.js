const { Logger } = require('../../util.js');

const ERROR = '[Error]';

const tool_error = ({ messages, config }) => {
  let time = 0, ret = [], seen = new Set(), i, m, t;
  Logger.log(`[tool_error_2] ${JSON.stringify(config)}`);
  for (let i = messages.length - 1; i >= 0; i--) {
    m = messages[i];
    if (m.role === 'tool') {
      if (m.content !== ERROR && m.content.startsWith('Error:')) {
        ttl = (m.content.includes('use ') && m.content.endsWith('tool instead'))
          ? (config.hint_ttl || config.ttl)
          : config.ttl;
        if (time <= ttl) continue;
        seen.add(m.id);
        m = null;
      }
      time++;
    } else if (m.role === 'assistant' && m.tool_calls) {
      for (let call of m.tool_calls) {
        if (call && call.type && call.type === 'function'
            && seen.has(call.function.name)) {
          m = { ...m };
          m.tool_calls = [ ...(m.tool_calls) ];
          m.tool_calls.splice(m.tool_calls.indexOf(call), 1);
        }
      }
    }
    if (m) ret.push(m);
  }

  return { messages: ret };}

module.exports = tool_error;