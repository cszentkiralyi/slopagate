//const system_prompt = require('./system_prompt.js');
//const tool_age = require('./tool_age.js');
//const tool_length = require('./tool_length.js');
//const tool_redundancy = require('./tool_redundancy.js');
//const chat_importance = require('./chat_importance.js');
//const chat_summary = require('./chat_summary.js');
const tool_error = require('./tool_error.js');

const placeholder = (arg) => undefined;

module.exports = {
  //system_prompt,
  system_prompt:  placeholder,
  //tool_age,
  tool_age: placeholder,
  //tool_length,
  tool_length: placeholder,
  //tool_redundancy,
  tool_redundancy: placeholder,
  //chat_importance,
  chat_importance: placeholder,
  //chat_summary,
  chat_summary: placeholder,
  tool_error
};