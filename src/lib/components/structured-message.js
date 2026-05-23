const Container = require('./container.js');
const Spinner = require('./spinner.js');
const Text = require('./text.js');

class StructuredMessage extends Container {
  #state = 'static';
  #subject = '';

  constructor(props) {
    super(props);
    Object.assign(this, props);

    this.spinner = new Spinner({ animation: this.animation, message: '', loop: true, hidden: true });
    this.subjectText = new Text({ content: '', padding: { left: 2 } });
    this.bodyText = new Text({ content: '' });

    this.children = [];
    this.#rebuildChildren();
  }

  #rebuildChildren() {
    if (this.#state === 'spin') {
      this.spinner.hidden = false;
      this.spinner.message = this.#subject || '';
      this.spinner.start();
      this.children = [this.spinner];
    } else {
      this.spinner.hidden = true;
      this.spinner.stop();
      this.subjectText.content = this.#subject || '';
      this.children = [this.subjectText];
    }
    if (this.bodyText.content && this.bodyText.content.length) {
      this.children.push(bodyText);
    }
    this.children.forEach(c => { c.root = this.root || this; });
  }

  set state(v) {
    this.#state = v;
    this.#rebuildChildren();
    this.root.render();
  }

  get state() { return this.#state; }

  set subject(v) {
    this.#subject = v;
    if (this.#state === 'spin') {
      this.spinner.message = v;
    } else {
      this.subjectText.content = v;
    }
    this.root.render();
  }

  set body(v) {
    this.bodyText.content = v;
    this.root.render();
  }
}

module.exports = StructuredMessage;
