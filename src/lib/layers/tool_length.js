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
      for (j = m.tool_calls.length - 1; j >= 0; j--) {
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
          for (k = args.length - 1; k >= 0; k--) {
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

module.exports = tool_length;