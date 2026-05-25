const ANSI = require('./ansi.js');

class MessageAggregator {
  constructor(interface) {
    this.interface = interface;
    this.#structuredMessages = new Map();
  }

  message(event) {
    let { callId, ...rest } = event;
    let inst = this.#structuredMessages.get(callId);
    if (!inst) {
      inst = this.interface.addMessage({
        role: 'tool',
        callId,
        subject: ANSI.fg(rest.subject || rest.content, 248),
        ...rest
      });
      this.#structuredMessages.set(callId, inst);
    } else {
      if (rest.body !== undefined) inst.body = rest.body;
      if (rest.subject !== undefined) inst.subject = ANSI.fg(rest.subject, 248);
      if (rest.state !== undefined) inst.state = rest.state;
    }
    this.interface.draw();
  }

  reset() {
    this.#structuredMessages.clear();
  }

  #structuredMessages;
}

module.exports = { MessageAggregator };
