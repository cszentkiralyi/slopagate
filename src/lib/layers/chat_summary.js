const { Logger } = require('../../util.js');

const chat_summary = async ({ messages, system_prompt, summarize, estimate, transcript }) => {
  // Convert to transcript string
  let tmessages = transcript(messages.filter(m => m.role !== 'tool'));

  // Get summary
  let summaryText = await summarize(tmessages);

  if (!summaryText) return;

  let ret = [
    { role: 'user', content: summaryText },
    { role: 'assistant', content: 'Thank you, now I have the context I need to continue.' }
  ];

  Logger.log(`chat_summary: compacted (replaced ${messages.length} messages with ${estimate(ret.length)}-token summary)`);
  return { messages: newMessages, system_prompt };
};

module.exports = chat_summary;