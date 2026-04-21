const ANSI = require('./ansi.js');
const Component = require('./component.js');
const Text = require('./text.js');

class TextInput extends Component {
  static SYMBOLS = {
    horizontal: '─',
    vertical: '│',
    nw: '┌',
    ne: '┐',
    se: '┘',
    sw: '└'
  };

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
          width - 2,
          {
             padding: { left: 0, right: 1 },
             align: prompt.length,
             fill: true
          }),
        horiz = (new Array(width - 2)).fill(TextInput.SYMBOLS.horizontal).join(''),
        lines = [
          TextInput.SYMBOLS.nw + horiz + TextInput.SYMBOLS.ne,
          ...(valueLines.map(l => TextInput.SYMBOLS.vertical + l + TextInput.SYMBOLS.vertical)),
          TextInput.SYMBOLS.sw + horiz + TextInput.SYMBOLS.se
        ];
    lines = lines.map(l => ANSI.bg(l, this.bg || 236));
    
    let dirty = Component.isDirty(this._lines, lines);
    this._lines = lines;
    return { lines, dirty, skip: (dirty ? 0 : lines.length) };
  }
  
  key(k) {
    // TODO: cursor position
    let char = k.charCodeAt(0);
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
      if (this.#ctrl_c) {
        this.#ctrl_c = false;
        if (this.#ctrl_timeout) {
          clearTimeout(this.#ctrl_timeout);
          this.#ctrl_timeout = null;
        }
        this.shortcuts['^C']();
        return;
      }
      this.#ctrl_c = true;
      this.#ctrl_timeout = setTimeout(() => this.#ctrl_c = false, 3000)
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