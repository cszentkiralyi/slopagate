const { Logger } = require('../../util.js');

const ERROR = '[Error]';

const tool_error = ({ messages, config }) => {
  let time = 0, ret = [], i, m, t;
  for (let i = messages.length - 1; i >= 0; i--) {
    m = messages[i];
    if (m.role === 'tool') {
      if (m.content !== ERROR && m.content.startsWith('Error:')) {
        ttl = (m.content.includes('use ') && m.content.endsWith('tool instead'))
          ? (config.hint_ttl || config.ttl)
          : config.ttl;
        if (time <= ttl) continue;
        m = { ...m };
        m.content = '[Error]';
      }
      time++;
    }
    ret.push(m);
  }

  return { messages: ret };
};

module.exports = tool_error;