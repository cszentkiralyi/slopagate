const Container = require('./container.js');
const HContainer = require('./hcontainer.js');
const Text = require('./text.js');

class Statusline extends HContainer {
  static BLANK = new Text('');
  
  dismissable;
  message;
  spinner;
  name = 'Statusline';
  
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
    
    this.hide();
  }

  #setLeftChild(child) {
    this.#left.removeAllChildren();
    this.#left.appendChild(child);
  }
  
  hide() {
    this.#setLeftChild(Statusline.BLANK);
  }
  async draw() {
    this.log(`WARNING: draw() called on Statusline!`);
    await this.root.draw();
  }

  dismiss() {
    if (!this.dismissable || !this.#left.children.length) return false;
    this.hide();
    return true;
  }
  
  showMessage(props, dismissable) {
    this.#setLeftChild(new Text(props));
    this.dismissable = !!dismissable;
  }
  
  showSpinner(message) {
    if (this.#left.children && this.#left.children[0] === this.spinner) return;
    // If you didn't provide a spinner in the constructor, that's on you
    this.spinner.message = message;
    this.dismissable = false;
    this.#setLeftChild(this.spinner);
    this.spinner.start();
  }

}

module.exports = Statusline;