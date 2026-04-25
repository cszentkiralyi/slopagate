const ANSI = require('../ansi.js');
const Component = require('./component.js');
const Text = require('./text.js');

class TextInput extends Component {
  static KEYS = {
    CR: 13,
    BS: 127,
    DEL: '\x1B[3~',
    UP: '\x1B[A',
    DOWN: '\x1B[B',
    RIGHT: '\x1B[C',
    LEFT: '\x1B[D'
  };

  #value = '';
  #caret = 1;
  #history = [];
  #historyIdx = -1;
  #hint;
  
  shortcuts;

  get value() { return this.#value; }
  get hint() {
    // Never call if we can't, or the user ain't typing
    if (!this.getHint || !this.#value || !this.value.length)
      return '';
    if (this.#hint && this.#hint.value === this.#value)
      return this.#hint.content;
    
    let h = this.getHint(this.#value);
    if (h && h.length) {
      this.#hint = { value: this.#value, content: h };
      return h;
    }
    return '';
  }

  render(width) {
    let prompt = this.prompt || '',
        padding = Object.assign(
          { left: 0, right: 1 },
          this.padding
        ),
        bg = this.bg || 236,
        hint, value, lines, dirty;
    
    if (this.#caret >= this.#value.length) {
      value = this.#value;
      if (hint = this.hint) {
        value += ANSI.invert(hint.charAt(0));
        value += ANSI.fg(hint.substring(1), 'gray');       
      } else {
        value += '█';
      }
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
        forceAlign: this.prompt && this.prompt.length,
        fill: !!bg
      }
    );
    lines = [
      ANSI.fg('\u2584'.repeat(width), bg),
      ...(lines.map(l => ANSI.bg(l, bg))),
      ANSI.fg('\u2580'.repeat(width), bg),
    ];

    dirty = Component.isDirty(this._lines, lines);
    this._lines = lines;
    return { lines, dirty, skip: (dirty ? 0 : lines.length) };
  }
  
  async key(k) {
    // TODO: URGENT: premature returns shouldn't prevent laters
    // TODO: this.shortcuts is basically shitty shorthand... I don't feel
    //       great about it now that I've taken another look.
    let char = k.charCodeAt(0),
        len = this.#value ? this.#value.length : 0,
        [laters, later] = this.#makeLater();
    if (this.onKey) await this.onKey(k, later, this);
    if (this.#caret > len) this.#caret = len;
    if (char === TextInput.KEYS.CR && k.length == 1) { // cr
      this.#historyIdx++;
      this.#history.push(this.#value);
      await this.onInput(this.#value, this);
    } else if (char === 127 || char === 8) { // bs
      if (len == 0) return;
      if (this.#caret == len) {
        this.#value = this.#value.substring(0, len - 1);
      } else {
        this.#value = this.#value.substring(0, this.#caret - 1)
          + this.#value.substring(this.#caret);
      }
      this.#caret--;
    } else if (k ===TextInput.KEYS.DEL) { // del
      if (len == 0) return;
      if (this.#caret == len) {
        this.#value = this.#value.substring(0, len);
      } else {
        this.#value = this.#value.substring(0, this.#caret)
          + this.#value.substring(this.#caret + 1);
      }
    } else if (k ===TextInput.KEYS.UP) {  // up
      if (this.#historyIdx > 0) {
        this.#historyIdx--;
        this.#value = this.getHistory(this.#historyIdx);
        this.#caret = this.#value.length;
      }
    } else if (k ===TextInput.KEYS.DOWN) { // down
      if (this.#historyIdx < this.#history.length - 1) {
        this.#historyIdx++;
        this.#value = this.getHistory(this.#historyIdx);
      } else if (this.#historyIdx == 0) {
        this.#value = '';
      }
      this.#caret = this.#value.length;
    } else if (k ===TextInput.KEYS.RIGHT) { // right
      if (this.#caret < len) this.#caret++;
    } else if (k ===TextInput.KEYS.LEFT) { // left
      if (this.#caret > 0) this.#caret--;
    } else if (char === 1) { // ^A (maybe home? not sure)
      this.#caret = 0;
    } else if (char === 5) { // ^E (maybe end)
      this.#caret = this.#value.length;
    } else if (char === 3) { // ^C
      //this.log(`Have ^C shortcut? ${'^C' in this.shortcuts} ${JSON.stringify(this.shortcuts)}`);
      if (!('^C' in this.shortcuts)) return;
      this.shortcuts['^C'](this);
    } else if (char === 4) { // ^D 
      if (!('^D' in this.shortcuts)) return;
      this.shortcuts['^D'](this);
    } else if (k === '\t' || char === 9) { // tab
      let hint;
      if ((hint = this.hint).length) this.#value += hint;
      this.#caret = this.#value.length;
    } else if (char >= 32 && (char - 127) != 0) {
      if (this.#caret == len) {
        this.#value += k;
      } else {
        this.#value = this.#value.substring(0, this.#caret)
          + k
          + this.#value.substring(this.#caret);
      }
      this.#caret++;
    }
    /*
    else {
      this.log(`key: ${JSON.stringify({ k, char, len })}`);
    }
    //*/
   
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