const ANSI = require('../ansi.js');
const Component = require('./component.js');
const Text = require('./text.js');

class TextInput extends Component {
  static KEYS = {
    CR: 13,
    BS: 127,
    UP: '\x1B[A',
    DOWN: '\x1B[B'
  };

  #value = '';
  #caret = 1;
  #history = [];
  #historyIdx = -1;
  
  shortcuts;

  get value() { return this.#value; }

  render(width) {
    let prompt = this.prompt || '',
        padding = Object.assign(
          { left: 0, right: 1 },
          this.padding
        ),
        bg = this.bg || 236,
        value, lines, dirty;
    
    if (this.#caret >= this.#value.length) {
      value = this.#value + '█';
    } else {
      value = this.#value.substring(0, this.#caret)
        + ANSI.invert(this.#value.substring(this.#caret, this.#caret + 1))
        + this.#value.substring(this.#caret + 1);
    }
    
    lines = Text.fit(
      prompt + value,
      width,
      {
        padding,
        indent: true,
        align: true,
        fill: !!bg
      }
    );
    lines = [
          ANSI.fg('\u2584'.repeat(width), bg),
          ...lines,
          ANSI.fg('\u2580'.repeat(width), bg),
    ].map(l => ANSI.bg(l, bg));

    dirty = Component.isDirty(this._lines, lines);
    this._lines = lines;
    return { lines, dirty, skip: (dirty ? 0 : lines.length) };
  }
  
  async key(k) {
    // TODO: cursor position
    // TODO: URGENT: premature returns shouldn't prevent laters
    // TODO: this.shortcuts is basically shitty shorthand... I don't feel
    //       great about it now that I've taken another look.
    let char = k.charCodeAt(0),
        len = this.#value ? this.#value.length : 0,
        [laters, later] = this.#makeLater();
    if (this.onKey) await this.onKey(k, later, this);
    if (this.#caret > len) this.#caret = len;
    if (char === 13 && k.length === 1) { // cr
      this.#historyIdx = -1;
      this.#history.push(this.#value);
      this.onInput(this.#value, this);
    } else if (char === 127 || char === 8) { // bs
      if (len == 0) return;
      if (this.#caret == len) {
        this.#value = this.#value.substring(0, len - 1);
      } else {
        this.#value = this.#value.substring(0, this.#caret - 1)
          + this.#value.substring(this.#caret);
      }
      this.#caret--;
    } else if (k === '\x1b[A') {  // up
      if (-this.#historyIdx < this.#history.length - 1) {
        this.#historyIdx--;
        this.#value = this.getHistory(this.#historyIdx);
        this.#caret = this.#value.length;
      }
    } else if (k === '\x1b[B') { // down
      if (this.#historyIdx < 0) {
        this.#historyIdx++;
        this.#value = this.getHistory(this.#historyIdx);
      } else if (this.#historyIdx == 0) {
        this.#value = '';
      }
      this.#caret = this.#value.length;
    } else if (k === '\x1b[C') { // right
      if (this.#caret < len) this.#caret++;
    } else if (k === '\x1b[D') { // left
      if (this.#caret > 0) this.#caret--;
    } else if (char === 1) { // home or ^A
      this.#caret = 0;
    } else if (char === 5) { // end or ^E
      this.#caret = this.#value.length;
    } else if (char === 3) { // ^C
      //this.log(`Have ^C shortcut? ${'^C' in this.shortcuts} ${JSON.stringify(this.shortcuts)}`);
      if (!('^C' in this.shortcuts)) return;
      this.shortcuts['^C'](this);
    } else if (char === 4) { // ^D 
      if (!('^D' in this.shortcuts)) return;
      this.shortcuts['^D'](this);
    } else if (char >= 32 && (char - 127) != 0) {
      if (this.#caret == len) {
        this.#value += k;
      } else {
        this.#value = this.#value.substring(0, this.#caret)
          + k
          + this.#value.substring(this.#caret);
      }
      this.#caret++;
    } else {
      this.log(`key: ${JSON.stringify({ k, char, len })}`);
    }

    if (laters.length) await laters.run();
  }
  
  clear() {
    this.#value = '';
  }
  
  getHistory(n) {
    if (n >= 0) {
      return this.#history[n] || '';
    } else {
      let l = this.#history.length,
          neg = Math.min(0, l - n - 1);
      return this.#history[neg] || '';
    }
  }
  
  #makeLater() {
    let laters = [],
        later = (f) => laters.push(f);
    laters.run = laters.forEach.bind(laters, f => f());
    return [laters, later];
  }
}

module.exports = TextInput;