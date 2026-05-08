const { Logger } = require('../../util.js');

const system_prompt = ({ system_prompt, messages, estimate, budget }) => {
  if (!system_prompt || !system_prompt.length) return {};

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
    return { system_prompt };
  }

  const reassemble = () => sections.map(s => `# ${s.header}\n${s.content}`).join('\n');

  // Stage 2: Soft truncation — remove low-priority sections
  if (estimate(reassemble()) > budget) {
    const lowPriorityHeaders = [
      'Tips', 'Examples', 'Notes', 'Extra', 'Additional', 'Supplementary',
      'Common Mistakes', 'Edge Cases', 'References', 'See Also',
    ];
    for (const hp of lowPriorityHeaders) {
      const idx = sections.findIndex(s => s.header === hp);
      if (idx !== -1 && estimate(reassemble()) > budget) {
        const removed = sections.splice(idx, 1)[0];
        Logger.log(`system_prompt: soft-trimmed section "${removed.header}"`);
      }
    }
  }

  // Stage 3: Hard truncation — sentence-by-sentence from the end
  if (estimate(reassemble()) > budget) {
    let result = reassemble();
    const sentences = result.match(/[^.!?]+[.!?]+/g) || [result];
    while (sentences.length > 1 && estimate(sentences.slice(0, -1).join(' ')) > budget) {
      sentences.pop();
    }
    result = sentences.join(' ');
    if (result !== reassemble()) {
      result += '\n\n[system prompt truncated due to context limits]';
    }
    Logger.log(`system_prompt: hard-trimmed to ${result.length} chars`);
    return { system_prompt: result };
  }

  if (sections.length < lines.filter(l => l.startsWith('#')).length || sections.length > 1) {
    Logger.log(`system_prompt: kept ${sections.length} sections`);
  }
  return { system_prompt: reassemble() };
};

module.exports = system_prompt;