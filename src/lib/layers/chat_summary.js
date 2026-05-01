const { Logger } = require('../../util.js');

const chat_summary = async ({ messages, system_prompt, summarize, estimate }) => {
  if (messages.length < 4) {
    return { messages, system_prompt };
  }

  // Work backwards from the end, skipping the 4 most recent messages
  let summarizeArray = [];
  for (let i = messages.length - 5; i >= 0; i--) {
    summarizeArray.unshift(messages[i]);
  }

  // Find the next assistant message going backwards
  let assistantIdx = -1;
  for (let i = summarizeArray.length - 1; i >= 0; i--) {
    if (summarizeArray[i].role === 'assistant') {
      assistantIdx = i;
      break;
    }
  }

  if (assistantIdx === -1) {
    return { messages, system_prompt };
  }

  // Extract messages from that assistant to the start of the array
  summarizeArray = summarizeArray.slice(0, assistantIdx + 1);

  // Convert to transcript string
  let transcript = summarizeArray
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  // Get summary
  let summaryText = await summarize(transcript);

  if (!summaryText) {
    return { messages, system_prompt };
  }

  // Build the new compacted messages array
  let latestMessages = messages.slice(summarizeArray.length);
  let newMessages = [
    { role: 'user', content: summaryText },
    { role: 'assistant', content: 'Thank you, now I have the context I need to continue.' },
    ...latestMessages
  ];

  let summaryTok = estimate(summaryText);
  Logger.log(`chat_summary: compacted (replaced ${summarizeArray.length} messages with ${summaryTok}-token summary)`);
  return { messages: newMessages, system_prompt };
};

module.exports = chat_summary;