const Component = require('./component.js');
const Text = require('./text.js');

class Spinner extends Component {
  static FRAMES = {
    small: [ '⠟', '⠯', '⠷', '⠾', '⠽', '⠻' ],
    //small: [ "⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈" ],
    large: [ '⡿', '⣟', '⣯', '⣷', '⣾', '⣽', '⣻', '⢿' ],
    star: [ '-', '\\', '|', '/', '-', '\\', '|', '/'],
    bar: [ '[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]' ]
  };
  static DELAY_MS = 400;
  
  #lastRender = null;
  #lastRenderedFrame = -1;
  #loop = true;
  message = null;
  animation = null;
  
  constructor(props) {
    super(props);
    Object.assign(this, props);
    
    setTimeout(() => this.root.draw(), Spinner.DELAY_MS);
  }
  
  start() {
    this.#loop = true;
  }
  
  dispose() {
    this.#loop = false;
  }
  
  render(width) {
    let now = Date.now(),
        diff = (now - this.#lastRender);
    let frame = this.#lastRenderedFrame;
    if (!this.#lastRender || diff >= Spinner.DELAY_MS) 
      frame++;
    if (frame > Spinner.FRAMES[this.animation].length - 1)
       frame = 0;
    if (this.#loop) {
      setTimeout(() => this.root.draw(), Spinner.DELAY_MS);
    }
    let lines;
    if (frame === this.#lastRenderedFrame) {
      lines = this._lines;
    } else {
      let blank = (new Array(width)).fill(' ').join(''),
          leftPad = new Array(this.padding && this.padding.left || 0).fill(' ').join(''),
          rightPad = new Array(this.padding && this.padding.right || 0).fill(' ').join(''),
          topPad = this.padding && this.padding.top ? new Array(this.padding.top).fill('\n') : [],
          bottomPad = this.padding && this.padding.bottom ? new Array(this.padding.bottom).fill('\n') : [],
          spin = `${Spinner.FRAMES[this.animation][frame]} ${this.message || ''}`;
      lines = [
        ...topPad,
        `${leftPad}${spin}${rightPad}`,
        ...bottomPad
      ].map(line => Text.fit(line, width)).flat();
    }
    let dirty = Component.isDirty(this._lines, lines);
    if (dirty) this._lines = lines;
    this.#lastRender = now;
    this.#lastRenderedFrame = frame;
    return {
      lines, dirty, skip: (this.dirty ? 0 : lines.length)
    };
  }
}

module.exports = Spinner;