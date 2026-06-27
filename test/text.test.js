const Text = require('../src/lib/components/text.js');
const ANSI = require('../src/lib/ansi.js');
const test = require('node:test');

test('Text.fit wraps long lines correctly', (t) => {
  const s = 'This is a very long sentence that should wrap multiple times across several lines to demonstrate the bug';
  const lines = Text.fit(s, 40, { forceAlign: true, padding: { left: 2 } });
  
  lines.forEach((line, i) => {
    const visualWidth = ANSI.measure(line);
    t.assert.ok(visualWidth <= 40, `Line ${i} visual width ${visualWidth} should be <= 40`);
  });
});

test('Text.fit handles list items with multi-line wrapping', (t) => {
  const s = '1. This is a very long sentence that should wrap multiple times across several lines to demonstrate the bug';
  const lines = Text.fit(s, 40, { forceAlign: true, padding: { left: 2 } });
  
  lines.forEach((line, i) => {
    const visualWidth = ANSI.measure(line);
    t.assert.ok(visualWidth <= 40, `Line ${i} visual width ${visualWidth} should be <= 40`);
  });
});