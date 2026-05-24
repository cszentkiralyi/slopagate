const Container = require('./container.js');
const Spinner = require('./spinner.js');
const Text = require('./text.js');
const ANSI = require('../ansi.js');

class StructuredMessage extends Container {
  #state = 'static';
  #subject = '';

  constructor(props) {
    const { subject, state, body, content, ...rest } = props;
    super(rest);
    Object.assign(this, rest);

    this.spinner = new Spinner({ animation: 'blink-diamond-gray', message: '', loop: true, hidden: true });
    this.subjectText = new Text({ content: '' });
    this.bodyText = new Text({ content: '' });
    this.#iconText = new Text({ content: '' });

    this.#subject = subject ?? content;
    if (state !== undefined) this.#state = state;
    if (body !== undefined) this.bodyText.content = body;
    this.#rebuildChildren();
  }

  #rebuildChildren() {
    this.children.length = 0;
    if (this.#state === 'spin') {
      this.spinner.hidden = false;
      this.spinner.message = this.#subject || '';
      this.spinner.start();
      this.children.push(this.spinner);
    } else {
      this.spinner.hidden = true;
      this.spinner.stop();
      let icon = '';
      if (this.#state === 'done') {
        icon = ANSI.fg('◆ ', 2);
      } else if (this.#state === 'error') {
        icon = ANSI.fg('◆ ', 1);
      } else if (this.#state === 'static') {
        icon = '  ';
      }
      this.#iconText.content = icon;
      this.subjectText.content = this.#subject || '';
      this.children.push(this.#iconText);
      this.children.push(this.subjectText);
    }
    if (this.bodyText.content && this.bodyText.content.length) {
      this.children.push(this.bodyText);
    }
    this.children.forEach(c => { c.root = this.root || this; });
  }

  set state(v) {
    this.#state = v;
    this.#rebuildChildren();
    this._dirty = true;
    this.root?.draw();
  }

  get state() { return this.#state; }

  get subject() { return this.#subject; }

  set subject(v) {
    this.#subject = v;
    if (this.#state === 'spin') {
      this.spinner.message = v;
    } else {
      this.subjectText.content = v;
    }
    if (this.#state !== 'spin' && this.#iconText) {
      this.#rebuildChildren();
    }
    this._dirty = true;
    this.root?.draw();
  }

  set body(v) {
    this.bodyText.content = v;
    if (this.bodyText.content && this.bodyText.content.length) {
      if (!this.children.includes(this.bodyText)) {
        this.children.push(this.bodyText);
        this.children.forEach(c => { c.root = this.root || this; });
      }
    } else if (this.children.includes(this.bodyText)) {
      this.children.splice(this.children.indexOf(this.bodyText), 1);
    }
    this._dirty = true;
    this.root?.draw();
  }
}

module.exports = StructuredMessage;
