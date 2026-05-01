//const system_prompt = require('./system_prompt.js');
const tool_age = require('./tool_age.js');
const tool_length = require('./tool_length.js');
//const tool_redundancy = require('./tool_redundancy.js');
const chat_score = require('./chat_score.js');
const chat_summary = require('./chat_summary.js');
const tool_error = require('./tool_error.js');

const placeholder = (arg) => undefined;

module.exports = {
  //system_prompt,
  system_prompt:  placeholder,
  tool_age,
  tool_length,
  //tool_redundancy,
  tool_redundancy: placeholder,
  chat_score,
  chat_summary,
  tool_error
};