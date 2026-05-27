const ANSI = require('./ansi.js');

class MessageAggregator {
  constructor(ui) {
    this.interface = ui;
    // group -> message instance
    this.#messageInstances = new Map();
    // group -> Map<callId, {summary, body, state}>
    this.#callData = new Map();
  }

  message(event) {
    let { callId, group, summary, body, state } = event;

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

    // Determine display
    let display;
    if (summaries.length === 1 || uniqueSummaries.length === 1) {
      display = {
        subject: `${group}(${summaries[0] || ''})`,
        body: lastBody ? ANSI.fg(lastBody, 248) : lastBody,
        state: finalState
      };
    } else {
      // Strip "Edit(...)" wrapper to just show "..."
      const paths = uniqueSummaries.map(s => {
        const match = (s ?? '').match(/^\w+\((.*)\)$/);
        return match ? match[1] : s ?? '';
      });
      const bodyText = paths.map((p, i, arr) => {
        const colored = ANSI.fg(p, 248);
        if (i < arr.length - 1) return `├ ${colored}`;
        return `└ ${colored}`;
      }).join('\n');
      display = {
        subject: `${group} ${summaries.length} operations`,
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
