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

const noop = () => {};

let _SeaLogger;
try {
  const { isSea } = require('node:sea');
  if (isSea()) {
    _SeaLogger = { log: noop, warn: noop };
  }
} catch {
  // node:sea not available (pre-20.6 or not in SEA build)
}

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
const Logger = _SeaLogger || new SimpleLogger('debug.log');

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0 && sec > 0) return `${m}m ${sec}s`;
  if (m > 0) return `${m}m`;
  return `${sec}s`;
}

/* Returns true if date is within the last 24 hours. */
function isRecent(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff < 24 * 60 * 60 * 1000;
}

/* Relative time string: "just now" (<5s), "5s ago", "3m ago", "2d ago", etc. */
function formatRelativeDate(dateStr) {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();
  const absDiff = Math.abs(diff);
  const suffix = diff >= 0 ? ' ago' : '';
  if (absDiff < 5000) return 'just now';
  // Convert to seconds first, then chain standard units
  const seconds = Math.floor(absDiff / 1000);
  const units = [
    [60, 's'],
    [60, 'm'],
    [24, 'h'],
    [7, 'd'],
    [4.345, 'w'],
    [12, 'mo'],
    [Infinity, 'y'],
  ];
  let value = seconds;
  let unitIdx = 0;
  for (let i = 0; i < units.length; i++) {
    const [divisor] = units[i];
    if (value / divisor < 1) {
      unitIdx = i;
      break;
    }
    value /= divisor;
    unitIdx = i + 1;
  }
  const [, label] = units[unitIdx];
  return `${Math.floor(value)}${label}${suffix}`;
}

/* Compact absolute date, e.g. "Jun 21, 2026". */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${mon} ${day}, ${year}`;
}

const truncate = (s, max, suffix = '…') =>
  s.length > max ? s.substring(0, max - suffix.length) + suffix : s;

module.exports = { ID, lerp, louse, Logger, formatMs, formatRelativeDate, formatDate, isRecent, truncate };