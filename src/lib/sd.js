const ANSI = require('./ansi.js');

class Slopdown {
  static INLINE_MARKUP_REGEX = /(\*\*\*|\*\*|\*|___|__|_|`)([^\1]+)\1/;
  static CODE_FENCE_REGEX = /^(\s*)```.*/;
  static SYMBOL_TO_KIND = {
    '*': 'emphasis',
    '_': 'emphasis',
    '**': 'strong',
    '__': 'strong',
    '***': 'strong-emphasis',
    '___': 'strong-emphasis',
    '`': 'inline-code'
  };
  static IDENTITY = s => s;
  
  #fmtByKind;

  constructor(theme) {
    /* `theme` is an object, mapping markup kind to formatting function. The
     * function is called as `fmt(content)` and should just return another
     * string that appropriately colors/themes/whatever `content`. */
    this.#fmtByKind = theme;
    if (!('strong-emphasis' in this.#fmtByKind)
        && ('strong' in this.#fmtByKind)
        && ('emphasis' in this.#fmtByKind)) {
      this.#fmtByKind['strong-emphasis'] = s => this.#fmtByKind['strong'](this.#fmtByKind['emphasis'](s));
    }
  }

  toAnsi(markdown) {
    let lines = [], rem, ret, inCode,
        m, search, sym, inner, idx, fmt, recur;
        
    markdown.split('\n').forEach(line => {
      // TODO: block quotes
      let line_q = line && line.length;

      if (line_q && line.trim().startsWith('```')) {
        if (inCode) {
          inCode = false;
          fmt = this.#fmtByKind['code'] || Slopdown.IDENTITY;
          lines.push(fmt(ret));
        } else {
          inCode = true;
          ret = '';
        }
        return;
      } else if (inCode) {
        fmt = this.#fmtByKind['code'] || Slopdown.IDENTITY;
        ret += (fmt(line)) + '\n';
        return;
      }

      if (!line_q) {
        lines.push('');
        return;
      }

      rem = line, ret = '';
      while (m = Slopdown.INLINE_MARKUP_REGEX.exec(rem)) {
        [search, sym, inner] = m;
        if ((idx = inner.indexOf(sym)) > -1) {
          inner = inner.substring(0, idx);
          search = search.substring(0, idx + (sym.length * 2));
        }
        recur = sym !== '`';
        idx = rem.indexOf(search);
        fmt = this.#fmtByKind[Slopdown.SYMBOL_TO_KIND[sym]] || Slopdown.IDENTITY;
        ret += rem.substring(0, idx);
        rem = rem.substring(Math.min(idx + inner.length + (sym.length * 2), rem.length));
        if (sym !== '`') {
          rem = fmt(inner) + rem;
        } else {
          ret += fmt(inner);
        }
      }
      if (rem) { ret += rem }
      lines.push(ret);
    });
    return lines.join('\n');
  }
}

module.exports = Slopdown;