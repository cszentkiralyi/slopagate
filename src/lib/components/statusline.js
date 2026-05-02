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
  #nextId = 0;
  get right() { return this.#right; }

  constructor(props) {
    super(props);

    Object.assign(this, props);
    
    this.#left = new Container({ name: 'Container.statusline.left' });
    this.#right = new Text({ justify: 'right' });
    this.appendChild(this.#left);
    this.appendChild(this.#right);
    
    // Stack of left-side entries: each entry is either a spinner entry
    // { isSpinner: true, text: string, id?: string } or a message entry
    // { isSpinner: false, text: object, dismissable: boolean, id?: string, timeout?: number, timer?: Timeout }
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
  
  hide(id) {
    if (!this.leftSide.length) return;
    let entry;
    if (id !== undefined) {
      const idx = this.leftSide.findIndex(e => e.id === id);
      if (idx === -1) return;
      entry = this.leftSide.splice(idx, 1)[0];
    } else {
      entry = this.leftSide.pop();
    }
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

  dismiss(id) {
    const entry = id !== undefined
      ? this.leftSide.find(e => e.id === id)
      : this.#peek();
    if (!entry || !entry.dismissable) return false;
    this.hide(id);
    return true;
  }
  
  showMessage(props, dismissable, id) {
    // Stop spinner animation
    this.spinner.hide();
    this.spinner.stop();

    const entry = {
      isSpinner: false,
      text: props,
      dismissable: !!dismissable,
      id: id ?? `msg-${this.#nextId++}`,
    };

    if (props.timeout) {
      entry.timer = setTimeout(() => {
        this.hide(id);
      }, props.timeout);
    }

    this.leftSide.push(entry);
    this.#renderTop();
  }
  
  showSpinner(message, id) {
    // Just push the new spinner on top of the stack; it takes priority
    // because #renderTop() only renders the top entry.
    const entryId = id ?? `spin-${this.#nextId++}`;
    this.leftSide.push({ isSpinner: true, text: message, id: entryId });
    this.#renderTop();
    return entryId;
  }

  clearSpinners() {
    this.leftSide = this.leftSide.filter(e => !e.isSpinner);
    this.#renderTop();
  }

}

module.exports = Statusline;