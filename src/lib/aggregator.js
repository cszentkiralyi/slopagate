const ANSI = require('./ansi.js');

class MessageAggregator {
  constructor(ui) {
    this.interface = ui;
    this.#structuredMessages = new Map();
  }

  message(event) {
    let { callId, ...rest } = event;
    
    // Group by tool name
    const rawSubject = rest.subject || rest.content || 'Tool';
    const toolName = rawSubject.split(/\s+/)[0];
    
    let inst = this.#structuredMessages.get(toolName);
    if (!inst) {
      inst = {
        subjects: [],
        states: [],
        display: null,
        interfaceMsg: null
      };
      this.#structuredMessages.set(toolName, inst);
    }

    // Track subjects and states
    if (rest.subject !== undefined) inst.subjects.push(rest.subject);
    if (rest.state !== undefined) inst.states.push(rest.state);
    if (rest.body !== undefined) inst.body = rest.body;

    // Determine final state
    const isSpinning = inst.states.some(s => s === 'spinning');
    const finalState = isSpinning ? 'spinning' : (inst.states[inst.states.length - 1] || null);

    // Determine display based on unique summaries
    const uniqueSubjects = [...new Set(inst.subjects)];
    
    if (inst.subjects.length === 1 || uniqueSubjects.length === 1) {
      // Single message or all identical summaries -> normal behavior
      inst.display = {
        subject: ANSI.fg(inst.subjects[0] || 'Tool', 248),
        body: inst.body,
        state: finalState
      };
    } else {
      // Multiple different summaries -> aggregate
      inst.display = {
        subject: ANSI.fg(`${toolName} ${inst.subjects.length} operations`, 248),
        body: uniqueSubjects.join('\n'),
        state: finalState
      };
    }

    // Create or update the interface message
    if (!inst.interfaceMsg) {
      inst.interfaceMsg = this.interface.addMessage({
        role: 'tool',
        callId,
        ...inst.display
      });
    } else {
      Object.assign(inst.interfaceMsg, inst.display);
    }

    this.interface.draw();
  }

  reset() {
    this.#structuredMessages.clear();
  }

  #structuredMessages;
}

module.exports = { MessageAggregator };
