const ANSI = require('./ansi.js');
const { truncate } = require('../util.js');

class MessageAggregator {
  constructor(ui) {
    this.interface = ui;
    // group -> message instance
    this.#messageInstances = new Map();
    // group -> Map<callId, {summary, body, state}>
    this.#callData = new Map();
  }

  // TODO: clean up — this is a temporary hack using nounPlural from the event.
  // The aggregator should get nounPlural from a proper toolbox reference, not via the event.
  message(event) {
    let { callId, group, summary, body, state, nounPlural } = event;

    // Initialize group structures if needed
    if (!this.#callData.has(group)) {
      this.#callData.set(group, new Map());
    }

    // Update or create per-call data
    const callMap = this.#callData.get(group);
    callMap.set(callId, { summary, body, state });

    // Determine final state for the group
    const states = [...callMap.values()].map(c => c.state);
    const isSpinning = states.some(s => s === 'spinning');
    const finalState = isSpinning ? 'spinning' : (states[states.length - 1] || null);

    // Get the last call's body (most recently inserted)
    const lastCall = [...callMap.values()].pop();
    const lastBody = lastCall?.body ?? null;

    // Get all summaries
    const summaries = [...callMap.values()].map(c => c.summary);
    const uniqueSummaries = [...new Set(summaries)];

    const MAX_LINE_LEN = 60;
    
    // Determine display
    let display;
    if (summaries.length === 1 || uniqueSummaries.length === 1) {
      const subject = `${group}(${summaries[0] || ''})`;
      const wasTruncated = subject.length > MAX_LINE_LEN;
      const truncated = truncate(subject, MAX_LINE_LEN);
      const fixed = wasTruncated ? truncated + ')' : truncated;
      display = {
        subject: fixed,
        body: lastBody ? ANSI.fg(lastBody, 248) : lastBody,
        state: finalState
      };
    } else {
      const MAX_LINES = 5;
      const truncated = uniqueSummaries.slice(-MAX_LINES);
      const extra = uniqueSummaries.length - truncated.length;

      const MAX_LINE_LEN = 60;
      const bodyLines = truncated.map((s, i, arr) => {
        const prefix = i < arr.length - 1 ? '├ ' : '└ ';
        const wasTruncated = s.length > MAX_LINE_LEN;
        const truncated = truncate(s, MAX_LINE_LEN);
        const fixed = truncated;
        const colored = ANSI.fg(fixed, 248);
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

    // Create or update the message instance
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
