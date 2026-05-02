const Container = require('./container.js');
const HContainer = require('./hcontainer.js');
const Text = require('./text.js');

class Statusline extends HContainer {
  static BLANK = new Text('');
  
  name = 'Statusline';

  spinner;
  padding = { left: 1 };
  
  #left;
  #right;
  get right() { return this.#right; }

  constructor(props) {
    super(props);

    Object.assign(this, props);
    
    this.#left = new Container({ name: 'Container.statusline.left' });
    this.#right = new Text({ justify: 'right' });
    this.appendChild(this.#left);
    this.appendChild(this.#right);
    
    // Stack of left-side entries: each entry is either a spinner entry
    // { isSpinner: true, text: string } or a message entry
    // { isSpinner: false, text: object, dismissable: boolean, timeout?: number, timer?: Timeout }
    this.leftSide = [];
    
    this.hide();
  }

  #setLeftChild(child) {
    this.#left.removeAllChildren();
    this.#left.appendChild(child);
  }

  #peek() {
    return this.leftSide.length ? this.leftSide[this.leftSide.length - 1] : null;
  }

  #renderTop() {
    const entry = this.#peek();
    if (!entry) {
      this.#setLeftChild(Statusline.BLANK);
      this.spinner.hide();
      return;
    }
    if (entry.isSpinner) {
      this.spinner.message = entry.text;
      this.#setLeftChild(this.spinner);
      this.spinner.show();
      this.spinner.start();
    } else {
      this.spinner.hide();
      this.#setLeftChild(new Text(entry.text));
    }
  }
  
  hide() {
    if (!this.leftSide.length) return;
    const entry = this.leftSide.pop();
    if (entry.timeout && entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    this.#renderTop();
  }
  async draw() {
    this.log(`WARNING: draw() called on Statusline!`);
    await this.root.draw();
  }

  dismiss() {
    const entry = this.#peek();
    if (!entry || !entry.dismissable) return false;
    this.hide();
    return true;
  }
  
  showMessage(props, dismissable) {
    // Stop spinner animation
    this.spinner.hide();
    this.spinner.stop();

    const entry = {
      isSpinner: false,
      text: props,
      dismissable: !!dismissable,
    };

    if (props.timeout) {
      entry.timer = setTimeout(() => {
        this.hide();
      }, props.timeout);
    }

    this.leftSide.push(entry);
    this.#renderTop();
  }
  
  showSpinner(message) {
    // Pop any non-spinner entries (messages) blocking the spinner
    let top = this.#peek();
    while (top && !top.isSpinner) {
      if (top.timeout && top.timer) {
        clearTimeout(top.timer);
        top.timer = null;
      }
      this.leftSide.pop();
      top = this.#peek();
    }
    if (top) return;

    this.leftSide.push({ isSpinner: true, text: message });
    this.#renderTop();
  }

}

module.exports = Statusline;