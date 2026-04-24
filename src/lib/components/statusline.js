const HContainer = require('./hcontainer.js');

class Statusline extends HContainer {
  setChild(child) {
    this.dirtyRender = true;
    this.removeAllChildren();
    this.appendChild(child);
  }
}

module.exports = Statusline;