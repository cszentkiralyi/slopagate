const ANSI = require('./ansi.js');
const { truncate, truncateBody } = require('../util.js');

const MAX_DISPLAY_LINES = 5;
const MAX_LINE_LEN = 60;
const BODY_GLYPH = '└ ';
const BODY_INDENT = ' '.repeat(ANSI.measure(BODY_GLYPH));

function countLines(body) {
  if (!body) return 0;
  return body.split('\n').length;
}

class MessageAggregator {
  constructor(ui) {
    this.interface = ui;
    this.#messageInstances = new Map();
    this.#callData = new Map();
  }

  message(event) {
    let { callId, group, summary, body, state, nounPlural } = event;

    if (!this.#callData.has(group)) {
      this.#callData.set(group, new Map());
    }

    const callMap = this.#callData.get(group);
    callMap.set(callId, { summary, body, state });

    const states = [...callMap.values()].map(c => c.state);
    const isSpinning = states.some(s => s === 'spinning');
    const finalState = isSpinning ? 'spinning' : (states[states.length - 1] || null);

    const allCalls = [...callMap.values()];
    const summaries = allCalls.map(c => c.summary);
    const uniqueSummaries = [...new Set(summaries)];

    let display;
    if (summaries.length === 1 || uniqueSummaries.length === 1) {
      // Single call: show subject + truncated body
      const subject = `${group}(${summaries[0] || ''})`;
      const wasTruncated = ANSI.measure(subject) > MAX_LINE_LEN;
      const truncated = truncate(subject, MAX_LINE_LEN);
      const fixed = wasTruncated ? truncated + ')' : truncated;
      const displayBody = truncateBody(body, MAX_DISPLAY_LINES, MAX_LINE_LEN);
      const bodyLines = displayBody ? displayBody.split('\n') : [];
      const prefixedBody = bodyLines.map((l, i) => i === 0 ? `${BODY_GLYPH}${l}` : `${BODY_INDENT}${l}`).join('\n');
      display = {
        subject: fixed,
        body: prefixedBody ? ANSI.fg(prefixedBody, 248) : null,
        state: finalState
      };
    } else {
      // Multiple calls: show subjects with line counts
      const shownSummaries = uniqueSummaries.slice(-MAX_DISPLAY_LINES);
      const extra = uniqueSummaries.length - shownSummaries.length;

      const bodyLines = shownSummaries.map((s, i, arr) => {
        const prefix = i < arr.length - 1 ? '├ ' : '└ ';
        const callForSummary = allCalls.find(c => c.summary === s);
        const lineCount = countLines(callForSummary?.body);
        const lineTag = lineCount > 0 ? ` [${lineCount} lines]` : '';
        const colored = ANSI.fg(truncate(s, MAX_LINE_LEN) + lineTag, 248);
        return `${prefix}${colored}`;
      });
      if (extra > 0) {
        bodyLines.unshift(`│ [+${extra} more]`);
      }
      const bodyText = bodyLines.join('\n');
      display = {
        subject: `${group} ${summaries.length} ${nounPlural || 'operations'}`,
        body: bodyText ? ANSI.fg(bodyText, 248) : bodyText,
        state: finalState
      };
    }

    if (!this.#messageInstances.has(group)) {
      this.#messageInstances.set(group, this.interface.addMessage({
        role: 'tool',
        callId,
        ...display
      }));
    } else {
      Object.assign(this.#messageInstances.get(group), display);
    }

    this.interface.draw();
  }

  reset() {
    this.#messageInstances.clear();
    this.#callData.clear();
  }

  #messageInstances;
  #callData;
}

module.exports = { MessageAggregator };
