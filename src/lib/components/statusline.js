const HContainer = require('./hcontainer.js');
const Text = require('./text.js');

class Statusline extends HContainer {
  static BLANK = new Text('');

  dismissable;
  spinner;

  constructor(props) {
    super(props);
    this.hide();

    Object.assign(this, props);
  }

  #setChild(child) {
    this.removeAllChildren();
    this.appendChild(child);
  }
  
  hide() {
    this.#setChild(Statusline.BLANK);
  }

  dismiss() {
    if (!this.dismissable || !this.children.length) return false;
    this.hide();
    return true;
  }
  
  showMessage(props, dismissable) {
    this.#setChild(new Text(props));
    this.dismissable = !!dismissable;
  }
  
  showSpinner(message) {
    // If you didn't provide a spinner in the constructor, that's on you
    this.spinner.message = message;
    this.spinner.start();
    this.#setChild(this.spinner);
  }

}

module.exports = Statusline;