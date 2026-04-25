const system_prompt = require('./system_prompt.js');
const tool_age = require('./tool_age.js');
const tool_length = require('./tool_length.js');
const tool_redundancy = require('./tool_redundancy.js');
const chat_importance = require('./chat_importance.js');
const chat_summary = require('./chat_summary.js');

module.exports = {
  system_prompt,
  tool_age,
  tool_length,
  tool_redundancy,
  chat_importance,
  chat_summary
};