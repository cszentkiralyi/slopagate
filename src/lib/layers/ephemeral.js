const { Logger } = require('../../util.js');

const ephemeral = ({ messages }) => {
  const before = messages.length;
  const ret = messages.filter(m => !m.ephemeral);
  const dropped = before - ret.length;
  if (dropped > 0) {
    Logger.log(`ephemeral: dropped ${dropped} ephemeral messages (${before} -> ${ret.length})`);
  }
  return { messages: ret };
};

module.exports = ephemeral;