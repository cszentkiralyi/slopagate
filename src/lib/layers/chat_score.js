const { Logger, lerp, louse } = require('../../util.js');

const T = 5;

const chat_score = ({ messages, config, context_window }) => {
  let max_x = messages.length - 1,
      turn = config.user_turns || 0;
      ret = [], i, m;

  const f = (x) => louse(x / max_x);
  const g = (x, t) => (x > 0.5) ? x : Math.max((1 - (t / T)) * x, 0);
      
  for (i = 0; i <= max_x; i++) {
    m = messages[i];
    if (m.role === 'user') turn++;
    if (g(f(i), turn) > config.threshold) {
      ret.push(m);
    } else {
      Logger.log(`chat_score: dropping i=${i} (${(i / max_x).toFixed(3)}) t=${turn} f=${f(x).toFixed(3)} g=${g(f(x), turn).toFixed(3)}`)
    }
  }

  Logger.log(`chat_score: threshold=${config.threshold}, ${max_x} rows -> ${ret.length}`);
      
  return { messages: ret };
};

module.exports = chat_score;