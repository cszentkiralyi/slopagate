const ANSI = require('../ansi.js');
const Text = require('./text.js');
const TextInput = require('./textinput.js');
const Component = require('./component.js');

class Picker extends Component {
  name = 'Picker';

  message;
  choices; // { label, value, default? }
  symbols;

  #active;
  #text;
  
  /* Expected props: message, choices, select(), cancel() */
  constructor(props) {
    super(props);
    Object.assign(this, props);
    this.symbols = { active: '◆', inactive: this.inactiveSymbol || '◇' };

    this.symbols.alne = ANSI.measure(this.symbols.active),
    this.symbols.ilen = ANSI.measure(this.symbols.inactive);
    
    this.#active = this.choices.findIndex(c => c.default);
    this.#text = new Text({ padding: { left: 1, right: 1 } });
    this.updateContent();
  }
  
  render(width) {
    return this.#text.render(width);
  }
  
  updateContent() {
    let lines = [ this.message ],
        extraLeft = ''.repeat(Math.abs(this.symbols.alen - this.symbols.ilen)),
        active, sym;
    this.choices.forEach((choice, i) => {
      active = i == this.#active;
      sym = active ? this.symbols.active : this.symbols.inactive;
      lines.push(`${sym}${active ? '' : extraLeft} ${i + 1}. ${choice.label}`);
    });
    this.#text.content = lines.join('\n');
  }
  
  async key(k) {
    /* TODO
     * - [ ] Number keys select directly by index
     * - [x] Up/down changes active, enter selects active
     * - [x] Escape cancels
     */
    let char = k.charCodeAt(0), update = false;
    if (char === TextInput.KEYS.CR && this.#active > -1 && this.#active < this.choices.length) {
      this.select(this.choices[this.#active].value);
    } else if (k === TextInput.KEYS.UP && this.#active > 0) {
      this.#active--;
      update = true;
    } else if (k === TextInput.KEYS.DOWN && this.#active < this.choices.length - 1) {
      this.#active++;
      update = true;
    } else if (k === TextInput.KEYS.ESC) {
      if (typeof this.cancel === 'function') {
        this.cancel();
      } else {
        this.select(null);
      }
    } else if (k >= '1' && k <= '9') {
      let idx = parseInt(k) - 1;
      if (idx < this.choices.length) {
        this.select(this.choices[idx].value);
      }
    }
    
    if (!update) return;
    
    this.updateContent();
    this.root.draw();
  }
}

module.exports = Picker;