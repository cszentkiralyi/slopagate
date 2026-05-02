const { Logger, lerp, louse } = require('../../util.js');

const chat_score = ({ messages, config, context_window }) => {
  let max_x = messages.length - 1,
      ret = [], i;
      
  for (i = 0; i <= max_x; i++) {
    if (louse(i / max_x) > config.threshold)
      ret.push(messages[i]);
  }

  Logger.log(`chat_score: threshold=${config.threshold}, ${max_x} rows -> ${ret.length}`);
      
  return { messages: ret };
};

module.exports = chat_score;