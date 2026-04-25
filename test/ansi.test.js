const ANSI = require('../src/lib/ansi.js');
const test = require('node:test');

// ===== resolveColor Tests =====
test('resolveColor handles valid color strings', (t) => {
  t.assert.equal(ANSI.resolveColor('red'), 1);
  t.assert.equal(ANSI.resolveColor('green'), 2);
  t.assert.equal(ANSI.resolveColor('white'), 15);
});

test('resolveColor handles color codes as numbers', (t) => {
  t.assert.equal(ANSI.resolveColor(1), 1);
  t.assert.equal(ANSI.resolveColor(2), 2);
});

test('resolveColor handles null and undefined', (t) => {
  t.assert.equal(ANSI.resolveColor(null), null);
  t.assert.equal(ANSI.resolveColor(undefined), null);
  t.assert.equal(ANSI.resolveColor(''), null);
});

// ===== fg/bg Tests =====
test('fg applies foreground color to text', (t) => {
  const colored = ANSI.fg('hello', 'red');
  t.assert.ok(colored.includes('\x1B[38:5:1m'));
  t.assert.ok(colored.includes('hello'));
});

test('fg returns plain text for invalid color', (t) => {
  t.assert.equal(ANSI.fg('hello', 'invalid'), 'hello');
  t.assert.equal(ANSI.fg('hello', 9999), 'hello');
  t.assert.equal(ANSI.fg('hello', -1), 'hello');
  t.assert.equal(ANSI.fg('hello', 256), 'hello');
});

test('bg applies background color to text', (t) => {
  const bgColored = ANSI.bg('hello', 'blue');
  t.assert.ok(bgColored.includes('\x1B[48:5:4m'));
  t.assert.ok(bgColored.includes('hello'));
});

test('bg returns plain text for invalid color', (t) => {
  t.assert.equal(ANSI.bg('hello', 'invalid'), 'hello');
});

// ===== Text Style Tests =====
test('bold applies bold style', (t) => {
  t.assert.ok(ANSI.bold('text').includes('\x1B[1m'));
});

test('dim applies dim style', (t) => {
  t.assert.ok(ANSI.dim('text').includes('\x1B[2m'));
});

test('italic applies italic style', (t) => {
  t.assert.ok(ANSI.italic('text').includes('\x1B[3m'));
});

test('underline applies underline style', (t) => {
  t.assert.ok(ANSI.underline('text').includes('\x1B[4m'));
});

test('invert applies inverse style', (t) => {
  t.assert.ok(ANSI.invert('text').includes('\x1B[7m'));
});

test('strike applies strike-through style', (t) => {
  t.assert.ok(ANSI.strike('text').includes('\x1B[9m'));
});

// ===== Cursor Control Tests =====
test('hideCursor outputs hide code', (t) => {
  const output = ANSI.hideCursor();
  t.assert.ok(output.includes('\x1B[?25l'));
});

test('showCursor outputs show code', (t) => {
  const output = ANSI.showCursor();
  t.assert.ok(output.includes('\x1B[?25h'));
});

// ===== Cursor Movement Tests =====
test('cursorUp moves cursor up', (t) => {
  t.assert.equal(ANSI.cursorUp(1), '\x1B[1F');
  t.assert.equal(ANSI.cursorUp(5), '\x1B[5F');
});

test('cursorUp with n=0 returns carriage return', (t) => {
  t.assert.equal(ANSI.cursorUp(0), '\r');
});

test('eraseDown outputs erase code', (t) => {
  t.assert.equal(ANSI.eraseDown(), '\x1B[0J');
});

// ===== Escape Sequence Tests =====
test('esc returns plain text when escape is empty', (t) => {
  t.assert.equal(ANSI.esc('hello', ''), 'hello');
});

// ===== measure Tests =====
// Test 1: Basic ASCII string
test('measure returns correct length for ASCII', (t) => {
  t.assert.equal(ANSI.measure('hello world'), 11);
  t.assert.equal(ANSI.measure('12345'), 5);
});

// Test 2: Empty string
test('measure returns 0 for empty string', (t) => {
  t.assert.equal(ANSI.measure(''), 0);
  t.assert.equal(ANSI.measure(null), 0);
  t.assert.equal(ANSI.measure(undefined), 0);
});

// Test 3: ANSI escape codes are stripped
test('measure strips ANSI escape codes', (t) => {
  const escaped = '\x1B[31m' + 'red text' + '\x1B[0m';
  t.assert.equal(ANSI.measure(escaped), 8); // 'red text' without escapes (8 chars)
});

// Test 4: Single emoji
test('measure handles single emoji', (t) => {
  t.assert.equal(ANSI.measure('👋'), 2); // _M
});

// Test 5: Multiple emojis
test('measure handles multiple emojis', (t) => {
  t.assert.equal(ANSI.measure('👋👋👋'), 6); // _M_M_M
});

// Test 6: Mixed ASCII and emoji
test('measure handles mixed ASCII and emoji', (t) => {
  t.assert.equal(ANSI.measure('Hello 👋 World'), 14); // Hello (5) + _M (2) + World (5)
  t.assert.equal(ANSI.measure('Hi 🎉 there'), 11); // Hi (2) + _M (2) + there (5)
});

// Test 7: Emoji with ANSI escapes
test('measure strips ANSI and handles emoji', (t) => {
  const escapedEmoji = '\x1B[31m' + '👋' + '\x1B[0m';
  t.assert.equal(ANSI.measure(escapedEmoji), 2); // _M after stripping ANSI
});

// Test 8: Full-width characters (not emojis, but still multi-byte)
test('measure handles full-width characters', (t) => {
  // Full-width characters are U+FF01-U+FF5E range
  t.assert.equal(ANSI.measure('你好'), 2); // each becomes _M
});

// Test 9: Complex mix of elements
test('measure handles complex mix', (t) => {
  const complex = 'prefix 🎉 middle 🔥 end';
  const expected = 7 + 2 + 5 + 2 + 5 + 2; // prefix(6) + _M(2) + middle(6) + _M(2) + end(5)
  t.assert.equal(ANSI.measure(complex), expected);
});