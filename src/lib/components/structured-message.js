const Container = require('./container.js');
const Spinner = require('./spinner.js');
const Text = require('./text.js');
const ANSI = require('../ansi.js');
const { Logger } = require('../../util.js');

class StructuredMessage extends Container {
  #state = 'static';
  #subject = '';
  #iconText;
  
  name = 'SM';

  constructor(props) {
    const { subject, state, body, content, ...rest } = props;
    super(rest);
    Object.assign(this, rest);

    this.spinner = new Spinner({ animation: 'blink-diamond-gray', message: '', loop: false });
    this.subjectText = new Text({ content: '' });
    this.bodyText = new Text({ content: '' });

    this.#subject = subject ?? content;
    this.spinner.message = this.#subject;
    this.subjectText.content = this.#subject || '';
    if (body !== undefined) this.bodyText.content = body;
    if (state !== undefined) this.#state = state;
    this.#updateChildren();
  }

  #updateChildren() {
    this.log(`SM: ${this.#state} "${this.#subject || this.content}"`);
    this.removeAllChildren();
    if (this.#state === 'spin') {
      this.appendChild(this.spinner);
      this.spinner.start();
    } else {
      let icon = '';
      if (this.#state === 'done') {
        icon = ANSI.fg('◆ ', 2);
      } else if (this.#state === 'error') {
        icon = ANSI.fg('◆ ', 1);
      } else if (this.#state === 'static') {
        icon = '  ';
      }
      this.spinner.stop();
      this.appendChild(this.subjectText);
      this.subjectText.content = `${icon}${this.#subject || ''}`;
    }
    this.bodyText.hidden = !(this.bodyText.content && this.bodyText.content.length)
    this.appendChild(this.bodyText);
  }

  set state(v) {
    if (this.#state === v) return;
    this.#state = v;
    this.#updateChildren();
    this.root?.draw();
  }

  get state() { return this.#state; }

  get subject() { return this.#subject; }

 set subject(v) {
    if (this.#subject === v) return;
    this.#subject = v;
    this.spinner.message = v;
    this.subjectText.content = v;
    this.#updateChildren();
    this.root?.draw();
  }
  
  set body(v) {
    if (this.bodyText.content === v) return;
    this.bodyText.content = v;
    this.root?.draw();
  }
}

module.exports = StructuredMessage;
