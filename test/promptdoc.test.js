const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PromptDoc } = require('../src/lib/promptdoc.js');
const { Config } = require('../src/core/config.js');

test('PromptDoc renders SLOP.md via {Inject(SLOP)} inside {Guard(SLOP)}', () => {
  // Load the real SYSTEM.md and SLOP.md
  const systemPrompt = fs.readFileSync(path.join(__dirname, '..', '.slop', 'SYSTEM.md'), 'utf-8');
  const slopContent = fs.readFileSync(path.join(__dirname, '..', 'SLOP.md'), 'utf-8');

  // Build sub-prompts map exactly like Program does
  const subPrompts = new Map();
  subPrompts.set('SLOP', slopContent);

  // Config must have SLOP set for {Guard(SLOP)} to pass
  const config = new Config({ SLOP: slopContent });

  // Create PromptDoc and render
  const promptDoc = new PromptDoc(systemPrompt, subPrompts);
  const rendered = promptDoc.render(config);

  // The Guard(SLOP) block should be active (SLOP is truthy in config)
  // and {Inject(SLOP)} should be replaced with the SLOP.md content
  assert.ok(rendered.includes('# Slopagate Project Summary'),
    'rendered output should include SLOP.md content');
  assert.ok(rendered.includes('Terminal-based AI coding assistant'),
    'rendered output should include project type from SLOP.md');
  assert.ok(rendered.includes('VIBE:'),
    'rendered output should include rules from SLOP.md');

  // The Guard markers should be stripped
  assert.ok(!rendered.includes('{Guard(SLOP)}'),
    'Guard opening marker should be removed');
  assert.ok(!rendered.includes('{/Guard}'),
    'Guard closing marker should be removed');

  // {Inject(SLOP)} should be replaced (not present as-is)
  assert.ok(!rendered.includes('{Inject(SLOP)}'),
    'Inject marker should be replaced with content');
});