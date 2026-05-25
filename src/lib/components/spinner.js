const ANSI = require('../ansi.js');
const Component = require('./component.js');

class Spinner extends Component {
  static ANIMATIONS = {
    'braille-small': {
      delay: 150,
      frames: [ '⠟', '⠯', '⠷', '⠾', '⠽', '⠻' ]
    },
    'braille-large': {
      delay: 150,
      frames: [ '⡿', '⣟', '⣯', '⣷', '⣾', '⣽', '⣻', '⢿' ]
    },
    'braille-vert-scroll': {
      delay: 200,
      frames: [ ' ', '⠈', '⠘', '⠸', '⠰', '⠠' ]
    },
    'block-fade': {
      delay: 150,
      frames: [ ' ', '░', '▒', '▓', '█', '▓', '▒', '░' ]
    },
    'star': {
      delay: 300,
      frames: [ '-', '\\', '|', '/', '-', '\\', '|', '/' ]
    },
    'bar': {
      delay: 300,
      frames: [ '[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]' ]
    },
    'blink-diamond-gray': {
      delay: 500,
      frames: [
        ANSI.fg('◆', 242),
        ANSI.fg('◆', 255)
      ]
    }
  }
  
  #lastRender = null;
  #lastRenderedFrame = -1;
  #loop = true;
  #timer = null;
  message = null;
  animation = null;
  
  constructor(props) {
    super(props);
    Object.assign(this, props);
    
    if (this.loop || typeof this.loop === 'undefined') {
      if (!this.animation) { this.log('no animation, not looping'); this.#loop = false; }
      else if (this.root) {
        this.#timer = setTimeout(() => this.drawTimer(), Spinner.ANIMATIONS[this.animation].delay);
      }
    } else {
      this.#loop = false;
    }
    delete this.loop;
  }
  
  start() {
    this.#loop = true;
    if (this.root && this.animation && !this.#timer) {
      this.#timer = setTimeout(() => this.drawTimer(), 0);
    }
  }
  
  stop() {
    this.#loop = false;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
  
  dispose() {
    this.stop();
  }
  
  drawTimer() {
    this.#timer = null;
    this.root.draw();
  }
  
  render(width) {
    //this.log(`Spinner: render ${this.#lastRenderedFrame} : ${this.#lastRender}`);
    if (!this.animation) return { lines: [], dirty: true, skip: 0 };

    let now = Date.now(),
        diff = (now - this.#lastRender),
        frame = this.#lastRenderedFrame,
        { frames, delay } = Spinner.ANIMATIONS[this.animation],
        timeout = null;
    if (!this.#lastRender || diff >= delay) 
      frame++;

    //this.log(`Spinner: ${this.animation} ${this.#lastRenderedFrame} -> ${frame} after ${diff}ms`);
    if (frame > frames.length - 1)
       frame = 0;
    let lines, dirty = false;
    if (frame === this.#lastRenderedFrame && this._lines) {
      //this.log(`Spinner: recycling previous lines`);
      timeout = Math.max(delay - diff, 0);
      lines = this._lines;
    } else {
      //this.log(`Spinner: ${this.animation} rendering frame ${frame} after ${diff}ms`);
      //this.log(`Spinner: rendering frame with padding ${JSON.stringify(this.padding)}`);
      let leftPad = this.padding && this.padding.left ? ' '.repeat(this.padding.left) : '',
          rightPad = this.padding && this.padding.right ? ' '.repeat(this.padding.right) : '',
          topPad = this.padding && this.padding.top ?  new Array(this.padding.top) : [],
          bottomPad = this.padding && this.padding.bottom ? new Array(this.padding.bottom) : [],
          spin = `${frames[frame]} ${this.message || ''}`;
      timeout = delay;
      lines = [
        ...topPad,
        `${leftPad}${spin}${rightPad}`,
        ...bottomPad
      ];
      dirty = true;
      this._lines = lines;
      this.#lastRenderedFrame = frame;
      this.#lastRender = now;
    }

    if (!this.#timer && this.#loop && this.root) {
      this.#timer = setTimeout(() => this.drawTimer(), timeout);
    }
    
    //this.log(`Spinner: returning result of ${lines.length} lines, skip ${(dirty ? 0 : lines.length)}, dirty ${dirty}`);

    return {
      lines, dirty, skip: (dirty ? 0 : lines.length)
    };
  }
}

module.exports = Spinner;