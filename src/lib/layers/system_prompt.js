const { Logger } = require('../../util.js');

const system_prompt = ({ system_prompt, messages, estimate, budget }) => {
  if (!system_prompt || !system_prompt.length) return {};

  Logger.log(`system_prompt: running compaction (estimate=${estimate(system_prompt)} chars, budget=${budget} chars)`);

  // Stage 1: Split prompt into sections by top-level Markdown headers
  const lines = system_prompt.split('\n');
  const sections = [];
  let currentHeader = null;
  let currentContent = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#\s+(.+)$/);
    if (headerMatch) {
      if (currentHeader !== null) {
        sections.push({ header: currentHeader, content: currentContent.join('\n') });
      }
      currentHeader = headerMatch[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  // Push final section
  if (currentHeader !== null) {
    sections.push({ header: currentHeader, content: currentContent.join('\n') });
  } else if (lines.length) {
    // No headers — treat entire prompt as one section, return as-is
    Logger.log(`system_prompt: no sections found, returning as-is`);
    return { system_prompt };
  }

  Logger.log(`system_prompt: found ${sections.length} sections`);

  const reassemble = () => sections.map(s => `# ${s.header}\n${s.content}`).join('\n');

  // Stage 2: Soft truncation — remove low-priority sections
  if (estimate(reassemble()) > budget) {
    const lowPriorityHeaders = [
      'Tips', 'Examples', 'Notes', 'Extra', 'Additional', 'Supplementary',
      'Common Mistakes', 'Edge Cases', 'References', 'See Also',
    ];
    let softRemoved = 0;
    for (const hp of lowPriorityHeaders) {
      const idx = sections.findIndex(s => s.header === hp);
      if (idx !== -1 && estimate(reassemble()) > budget) {
        const removed = sections.splice(idx, 1)[0];
        softRemoved++;
        Logger.log(`system_prompt: soft-trimmed section "${removed.header}"`);
      }
    }
    if (softRemoved > 0) {
      Logger.log(`system_prompt: soft-trimmed ${softRemoved} section(s)`);
    }
    // Check if soft truncation resolved the budget issue
    if (estimate(reassemble()) <= budget) {
      Logger.log(`system_prompt: soft truncation resolved budget (${estimate(reassemble())} <= ${budget})`);
      return { system_prompt: reassemble() };
    }
  }

  // Stage 3: Hard truncation — sentence-by-sentence from the end
  if (estimate(reassemble()) > budget) {
    let result = reassemble();
    const sentences = result.match(/[^.!?]+[.!?]+/g) || [result];
    const totalSentences = sentences.length;
    while (sentences.length > 1 && estimate(sentences.slice(0, -1).join(' ')) > budget) {
      sentences.pop();
    }
    const removedSentences = totalSentences - sentences.length;
    result = sentences.join(' ');
    if (result !== reassemble()) {
      result += '\n\n[system prompt truncated due to context limits]';
    }
    Logger.log(`system_prompt: hard truncation removed ${removedSentences} of ${totalSentences} sentences`);
    return { system_prompt: result };
  }

  Logger.log(`system_prompt: kept ${sections.length} sections, fits budget`);
  return { system_prompt: reassemble() };
};

module.exports = system_prompt;