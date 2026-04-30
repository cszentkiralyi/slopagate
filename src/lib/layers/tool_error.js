const { Logger } = require('../../util.js');

const tool_error = ({ messages, config }) => {
  Logger.log(`[tool_error] Running...`);
  let time = 0, i, m, t;
  for (let i = messages.length - 1; i >= 0; i--) {
    m = messages[i];
    if (m.role === 'tool') {
      ttl = (msg.content.includes('use ') && msg.content.endsWith('tool instead'))
        ? (config.hint_ttl || config.ttl)
        : config.ttl;
      if (time <= ttl) continue;
      Logger.log(`[tool_error] Compacting message ${i}`);
      m = { ...m };
      m.content = '[Error]';
      messages.splice(i, 1, m);
    }
    time++;
  }
  return { messages };
};

module.exports = tool_error;