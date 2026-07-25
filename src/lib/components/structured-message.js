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

    this.spinner = new Spinner({ animation: props.animation || 'blink-diamond-gray', message: '', loop: false });
    this.subjectText = new Text({ content: '' });
    this.bodyText = new Text({ content: '', padding: { left: 2 } });

    this.#subject = subject ?? content;
    this.#setSpinnerMessage(this.#subject);
    this.subjectText.content = this.#subject || '';
    if (body !== undefined) this.bodyText.content = this.#stripBody(body);
    if (state !== undefined) this.#state = state;
    this.#updateChildren();
  }

  #updateChildren() {
    // this.log(`SM: ${this.#state} "${this.#subject || this.content}"`);
    this.removeAllChildren();
    if (this.#state === 'spin') {
      this.appendChild(this.spinner);
      this.spinner.root = this.root;
      this.spinner.bg = this.subjectBg;
      this.spinner.fill = true;
      this.spinner.start();
    } else {
      let icon = '';
      if (this.#state === 'done') {
        icon = ANSI.fg(`${this.icon || '◆'} `, 70);
      } else if (this.#state === 'error') {
        icon = ANSI.fg(`${this.icon || '◆'} `, 160);
      } else if (this.#state === 'static') {
        icon = '  ';
      }
      this.spinner.stop();
      this.appendChild(this.subjectText);
      this.subjectText.content = `${icon}${this.#subject || ''}`;
    this.subjectText.bg = this.subjectBg;
    this.subjectText.fill = true;
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

  #setSpinnerMessage(text) {
    if (this.fg) {
      this.spinner.message = ANSI.fg(text, this.fg);
    } else {
      this.spinner.message = text;
    }
  }

  #stripBody(v) {
    if (typeof v !== 'string') return v;
    const lines = v.split('\n');
    let start = 0;
    while (start < lines.length && lines[start].trim() === '') start++;
    let end = lines.length;
    while (end > start && lines[end - 1].trim() === '') end--;
    return lines.slice(start, end).join('\n');
  }

  set subject(v) {
    if (this.#subject === v) return;
    this.#subject = v;
    this.#setSpinnerMessage(this.#subject);
    this.subjectText.content = v;
    this.#updateChildren();
    this.root?.draw();
  }
  
  set body(v) {
    const stripped = this.#stripBody(v);
    if (this.bodyText.content === stripped) return;
    this.bodyText.content = stripped;
    this.root?.draw();
  }

  render(width) {
    return super.render(width);
  }
}

module.exports = StructuredMessage;
