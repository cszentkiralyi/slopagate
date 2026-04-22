const ANSI = require('./ansi.js');
const Component = require('./component.js');
const Text = require('./text.js');

class TextInput extends Component {
  #value = '';
  #history = [];
  #historyIdx = -1;
  #ctrl_c = false;
  #ctrl_timeout = null;
  
  shortcuts;

  get value() { return this.#value; }

  render(width) {
    let prompt = this.prompt || '',
        value = prompt + this.value + '█',
        valueLines = Text.fit(
          value,
          width,
          {
             padding: { left: 0, right: 1 },
             align: prompt.length,
             fill: true
          }),
        bg = this.bg || 236,
        // Unicode block elements, upper/lower half block
        lines = [
          ANSI.fg('\u2584'.repeat(width), bg),
          ...(valueLines.map(l => ANSI.bg(l, bg))),
          ANSI.fg('\u2580'.repeat(width), bg),
        ];
    //lines = lines.map(l => ANSI.bg(l, this.bg || 236));
    
    let dirty = Component.isDirty(this._lines, lines);
    this._lines = lines;
    return { lines, dirty, skip: (dirty ? 0 : lines.length) };
  }
  
  key(k) {
    // TODO: cursor position
    let char = k.charCodeAt(0);
    if (this.onKey) this.onKey(k);
    if (char === 13 && k.length === 1) { // newline / cr
      this.#historyIdx = -1;
      this.#history.push(this.#value);
      this.onInput(this.#value);
      return;
    } else if (char === 127 || char === 8) { // backspace
      if (this.#value.length == 0) return;
      this.#value = this.#value.substring(0, this.#value.length - 1);
      return;
    } else if (k === '\x1b[A') {  // up
      if (-this.#historyIdx < this.#history.length - 1) {
        this.#historyIdx--;
        this.#value = this.getHistory(this.#historyIdx);
      }
      return;
    } else if (k === '\x1b[B') { // down
      if (this.#historyIdx < 0) {
        this.#historyIdx++;
        this.#value = this.getHistory(this.#historyIdx);
      } else if (this.#historyIdx == 0) {
        this.#value = '';
      }
      return;
    } else if (char === 3) { // ^C
      if (!('^C' in this.shortcuts)) return;
      this.shortcuts['^C'](this);
    } else if (char === 4) { // ^D 
      if (!('^D' in this.shortcuts)) return;
      this.shortcuts['^D'](this);
    } else if (char >= 32 && (char - 127) != 0) {
      this.#value += k;
      return;
    }
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
}

module.exports = TextInput;