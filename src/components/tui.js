class Component {
  constructor(props) { Object.assign(this, props); }
  render(width) { return { lines: [], dirty: false }; }
  static isDirty(prev, next) {
    if (prev.length != next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) return true;
    }
    return false;
  }
}

class Container extends Component {
  _lines = []; // cache
  children = [];
  root = null;
  
  render(width) {
    let lines = [],
        skip = 0,
        dirty = false;
    this.children.forEach(child => {
      let result = child.render(width);
      lines.push(...result.lines);
      if (!dirty && !result.dirty) {
        skip += result.lines.length;
      } else {
        dirty = true;
      }
    });
    this._lines = lines;
    return { lines, dirty, skip };
  }
}

class Text extends Component {
  content;
  
  // TODO: padding in all four directions, background/foreground colors
  render(width) {
    let lines = [], currentLine;
    this.content.split('\n').forEach(line => {
      if (!line) {
        lines.push('');
        return;
      }
      
      currentLine = '';
      line.split(' ').forEach(word => {
        let len = Text.measure(word);
        if (currentLine.length + len + 1 <= width) {
          curentLine += ' ' + word;
        } else {
          lines.push(currentLine);
          currentLine = word;
        }
      });
      if (currentLine) lines.push(currentLine);
      let dirty = Component.isDirty(this._lines, lines);
      this._lines = lines;
      return {
        lines,
        dirty,
        skip: dirty ? 0 : lines.length
      };
    });
  }

  static measure(s) {
    return (s || '').replace(/\x1B\[[0-9;]*m/, '').length;
  }
}

class Terminal extends Container {
  _first_render = true;
  
  
  static cursorUp(n) {
    // Move to the beginning of the line, then up n lines
    return `\x1B[${n}F;`;
  }
  static eraseFromCursor() {
    // 0 = cursor to end of screen, 1 = cursor to beginning, 2 = entire screen
    return `\x1B[0J;`;
  }
  
  static RESET_ESCAPE = '\x1B[0m';
  static COLORS = new Map([
    [ 'black', 0 ],
    [ 'red', 1 ],
    [ 'green', 2 ],
    [ 'yellow', 3 ],
    [ 'blue', 4 ],
    [ 'purple', 5 ],
    [ 'teal', 6 ],
    [ 'brightgrey', 7 ],
    [ 'gray', 8 ],
    [ 'brightred', 9 ],
    [ 'brightgreen', 110 ],
    [ 'brightyellow', 11 ],
    [ 'brightblue', 12 ],
    [ 'brightpurple', 13 ],
    [ 'brightteal', 14 ],
    [ 'white', 15 ],
  ]);

  static #resolveColor(color) {
    if (!color) return null;
    let t_color = typeof color;
    if (t_color === 'string') {
      return this.COLORS.get(color);
    } else if (t_color === 'number') {
      return color;
    }
    return null;
  }
  static fg(text, color) {
    let code = this.#resolveColor(color);
    if (!code) return text;
    return `\x1B[38:5:${code}m${text}${this.RESET_ESCAPE}`;
  }
  static bg(text, color) {
    let code = this.#resolveColor(color);
    if (!code) return text;
    return `\x1B[48:5:${code}m${text}${this.RESET_ESCAPE}`;
  }
  static bold(text) {
    return `\x1B[1m${text}${this.RESET_ESCAPE}`;
  }
  static dim(text) {
    return `\x1B[2m${text}${this.RESET_ESCAPE}`;
  }
  static italic(text) {
    return `\x1B[3m${text}${this.RESET_ESCAPE}`;
  }
  static underline(text) {
    return `\x1B[4m${text}${this.RESET_ESCAPE}`;
  }
  static strike(text) {
    return `\x1B[9m${text}${this.RESET_ESCAPE}`;
  }
}

module.exports = { Terminal, Text, Component };