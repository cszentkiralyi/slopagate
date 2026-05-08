const fs = require('node:fs');
const crypto = require('node:crypto');

const ID = () => crypto.randomBytes(8).toString('hex');

const lerp = (pct, min, max) => min + (pct * (max - min));

/* Like Gauss, cause Gaussian distribution, but lousy & shifted left-ish
 * ▇▇▅▃▂▁▂▃▄▅▆▇████
 * - 0.9 is amplitude A, we invert so (1 - A) is lowest score
 * - 0.5 is center
 * - 1.2x shrinks curve width by ~10%, maybe silly
 * - 0.25 is std dev (~68% +/- 1sd, 95% <= 2, 99% <= 3, etc)
 * 
 * f : [0, 1] -> (0.1, 1]
 */
const louse = (x) => Math.min(1, 1 - (0.9 * (Math.E ** (- ((x - 0.5) ** 2) / (2 * (0.25 ** 2))))));

class SimpleLogger {
  #stream;
  constructor(path, flags) {
    this.#stream = fs.createWriteStream(path, { flags: flags || 'w' });
  }
  log(x) {
    let s; 
    if (typeof x === 'string') {
      s = x;
    } else {
      x = JSON.stringify(x);
    }
    this.#stream.write(x + '\n');
  }
  warn(x) {
    let s;
    if (typeof x === 'string') {
      s = x;
    } else {
      x = JSON.stringify(x);
    }
    this.#stream.write('[WARN] ' + s + '\n');
  }
};
const Logger = new SimpleLogger('debug.log');

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0 && sec > 0) return `${m}m ${sec}s`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

module.exports = { ID, lerp, louse, Logger, formatMs };