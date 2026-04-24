const HContainer = require('./hcontainer.js');

class Statusline extends HContainer {
  setChild(child) {
    this.removeAllChildren();
    this.appendChild(child);
  }
}

module.exports = Statusline;