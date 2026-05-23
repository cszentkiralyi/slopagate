const Container = require('./container.js');
const HContainer = require('./hcontainer.js');
const Text = require('./text.js');

const { Logger, formatMs } = require('../../util.js');

class Statusline extends HContainer {
  static BLANK = new Text('');
  
  name = 'Statusline';

  spinner;
  
  #left;
  #right;
  #nextId = 0;
  pendingTimer = null;
  get right() { return this.#right; }

  constructor(props) {
    super(props);

    Object.assign(this, props);
    
    this.#left = new Container({ name: 'Container.statusline.left' });
    this.#right = new Text({ justify: 'right' });
    this.appendChild(this.#left);
    this.appendChild(this.#right);
    
    // Stack of left-side entries: each entry has a 'kind' that defines
    // how it's rendered:
    //   { kind: 'spinner', text: string, id?: string, start: number }
    //   { kind: 'message', text: object, dismissable: boolean, id?: string, timeout?: number, timer?: Timeout }
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
    //Logger.log(`Statusline: rendering ${JSON.stringify(entry)}`);
    if (!entry) {
      this.#setLeftChild(Statusline.BLANK);
      this.spinner.hide();
      return;
    }
    if (entry.kind === 'spinner') {
      const elapsed = formatMs(Date.now() - entry.start);
      this.spinner.message = `${entry.text} (${elapsed})`;
      this.#setLeftChild(this.spinner);
      this.spinner.show();
      this.spinner.start();
      // Schedule periodic redraws to update the elapsed time.
      clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => this.draw(), 200);
    } else {
      this.spinner.hide();
      this.#setLeftChild(new Text(entry.text));
    }
  }

 
  
  hide(id) {
    if (!this.leftSide.length) return;
    clearTimeout(this.pendingTimer);
    let entry;
    if (id !== undefined) {
      const idx = this.leftSide.findIndex(e => e.id === id);
      if (idx === -1) return;
      entry = this.leftSide.splice(idx, 1)[0];
    } else {
      entry = this.leftSide.pop();
    }
    //Logger.log(`Statusline: stack is now ${this.leftSide.length}, hid ${JSON.stringify(entry)}`);
    if (entry.timeout && entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    this.#renderTop();
  }
  async draw() {
    this.#renderTop();
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
      kind: 'message',
      text: props,
      dismissable: !!dismissable,
      id: id ?? `msg-${this.#nextId++}`,
    };
    //Logger.log(`Statusline: showing message ${JSON.stringify(entry)}`);

    if (props.timeout) {
      entry.timer = setTimeout(() => {
        this.hide(id);
      }, props.timeout);
    }

    this.leftSide.push(entry);
    this.#renderTop();
  }
  
  showSpinner(message, id) {
    // Only show a spinner if that ID isn't already set (prevent duplicates).
    const entryId = id ?? `spin-${this.#nextId++}`;
    if (this.leftSide.some(e => e.id === entryId)) return entryId;
    //Logger.log(`Statusline: showing spinner ${JSON.stringify({ id, message })}`);
    this.leftSide.push({ kind: 'spinner', text: message, id: entryId, start: Date.now() });
    this.#renderTop();
    return entryId;
  }

  clearSpinners() {
    clearTimeout(this.pendingTimer);
    this.leftSide = this.leftSide.filter(e => e.kind !== 'spinner');
    this.#renderTop();
  }

}

module.exports = Statusline;