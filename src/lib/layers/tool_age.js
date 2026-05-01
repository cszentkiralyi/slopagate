const { Logger } = require('../../util.js');

const tool_age = ({ messages, config }) => {
  let time, m, idx = null;
  for (i = messages.length - 1; i >= 0; i--) {
    if (!(m = messages[i]) || m.role !== 'tool') continue;
    if (time == config.ttl) {
      idx = i; 
      break;
    }
    time++;
  }
  if (idx) {
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
    return { messages: ret };
  }
  return;
}

module.exports = tool_age;