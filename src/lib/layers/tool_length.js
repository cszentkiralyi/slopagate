const { Logger } = require('../../util.js');

const TRIM_MSG = '[...trimmed tool output...]';
const TRIM_MSG_LEN = TRIM_MSG.length;

const trim = (s, start, end) => {
  return s.substring(0, start) + TRIM_MSG + s.substring(end);
};

const tool_length = ({ messages, config, context_window }) => {
  let max = (config.max > 1) ? config.max : (config.max * context_window),
      ret = [],
      len, d, start, end, next, args, arg,
      c, i, j, k, m, t, u;
  for (i = messages.length - 1; i >= 0; i--) {
    m = messages[i];
    if (m.content && (len = m.content.length) > max) {
      d = len - max;
      start = Math.floor((len - d) / 2 - (TRIM_MSG_LEN / 2) - 1);
      end = Math.ceil((len / 2) + (d / 2) + (TRIM_MSG_LEN / 2) + 1)
      m = { ...m };
      m.content = trim(m.content, start, end);
      Logger.log(`[tool_length] (max=${max}) reduced index ${i} from ${len} to ${m.content.length}`);
    }
    /*
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
              start = Math.floor((len - max) / 2 - (TRIM_MSG_LEN / 2) - 1);
              end = Math.ceil((len - start - (max / 2)) - (TRIM_MSG_LEN / 2) - 1);
              c.arguments[k] = trim(arg, start, end);
      Logger.log(`[tool_length] reduced argument from ${len} to ${c.arguments[k].length}`);
            }
          }
        }
        if (next) {
          m = { ...m };
          m.tool_calls = next;
        }
      }
    }
    */
    
    ret.push(m);
  }
  
  return { messages: ret };
};

module.exports = tool_length;