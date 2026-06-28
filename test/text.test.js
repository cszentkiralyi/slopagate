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

test('Text.fit enforces hanging indent for list items', (t) => {
  const s = '1. First item with enough text to wrap to the next line and demonstrate proper alignment';
  const lines = Text.fit(s, 40, { forceAlign: true, padding: { left: 2 } });
  
  // First line should contain the marker "1. "
  const firstLine = lines[0];
  t.assert.ok(firstLine.includes('1.'), 'First line should contain list marker "1."');
  
  // Check that wrapped lines have proper alignment
  // The regex captures "1. " (with trailing space), so alignX = 3
  // indent = leftPad (2) + alignX (3) = 5 columns
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const visualWidth = ANSI.measure(line);
    
    // Check that the line has ANSI cursor movement for the indent
    const cursorMovements = line.match(/\x1b\[(\d+)C/g) || [];
    const totalIndent = cursorMovements.reduce((sum, m) => {
      return sum + parseInt(m.match(/\x1b\[(\d+)C/)[1], 10);
    }, 0);
    
    // The indent should be leftPad + marker width (2 + 3 = 5)
    t.assert.equal(totalIndent, 5, `Line ${i} should have 5-column indent (leftPad=2 + "1. "=3), got ${totalIndent}`);
    
    t.assert.ok(visualWidth <= 40, `Line ${i} visual width ${visualWidth} should be <= 40`);
  }
});

test('Text.fit aligns wrapped lines with text after ">" prompt', (t) => {
  const s = '> This is a prompt line that should wrap and align with the "T" in "This"';
  const lines = Text.fit(s, 40, { forceAlign: true, padding: { left: 2 } });
  
  // First line should contain the ">" marker
  const firstLine = lines[0];
  t.assert.ok(firstLine.includes('>'), 'First line should contain ">" prompt marker');
  
  // The regex captures "> " (2 chars), so alignX = 2
  // With leftPad=2, total indent = 4
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cursorMovements = line.match(/\x1b\[(\d+)C/g) || [];
    const totalIndent = cursorMovements.reduce((sum, m) => {
      return sum + parseInt(m.match(/\x1b\[(\d+)C/)[1], 10);
    }, 0);
    
    t.assert.equal(totalIndent, 4, `Line ${i} should have 4-column indent (leftPad=2 + "> "=2), got ${totalIndent}`);
  }
});

test('Text.fit handles multi-digit list markers with hanging indent', (t) => {
  const s = '10. Multi-digit marker should still maintain proper hanging indent when text wraps';
  const lines = Text.fit(s, 40, { forceAlign: true, padding: { left: 2 } });
  
  // First line should contain the marker "10."
  const firstLine = lines[0];
  t.assert.ok(firstLine.includes('10.'), 'First line should contain "10." marker');
  
  // The regex captures "10. " (4 chars), so alignX = 4
  // With leftPad=2, total indent = 6
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cursorMovements = line.match(/\x1b\[(\d+)C/g) || [];
    const totalIndent = cursorMovements.reduce((sum, m) => {
      return sum + parseInt(m.match(/\x1b\[(\d+)C/)[1], 10);
    }, 0);
    
    t.assert.equal(totalIndent, 6, `Line ${i} should have 6-column indent (leftPad=2 + "10. "=4), got ${totalIndent}`);
  }
});

test('Text.fit handles bullet list items with hanging indent', (t) => {
  const s = '- Bullet point item with enough text to wrap and verify alignment with the text after the bullet';
  const lines = Text.fit(s, 40, { forceAlign: true, padding: { left: 2 } });
  
  // First line should contain the "-" marker
  const firstLine = lines[0];
  t.assert.ok(firstLine.includes('-'), 'First line should contain "-" bullet marker');
  
  // The regex captures "- " (2 chars), so alignX = 2
  // With leftPad=2, total indent = 4
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cursorMovements = line.match(/\x1b\[(\d+)C/g) || [];
    const totalIndent = cursorMovements.reduce((sum, m) => {
      return sum + parseInt(m.match(/\x1b\[(\d+)C/)[1], 10);
    }, 0);
    
    t.assert.equal(totalIndent, 4, `Line ${i} should have 4-column indent (leftPad=2 + "- "=2), got ${totalIndent}`);
  }
});