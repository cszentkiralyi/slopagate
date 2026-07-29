
const test = require('node:test');
const assert = require('node:assert/strict');
const Harness = require('../src/lib/harness.js');

test('$ARGUMENTS replaced with full args when provided', (t) => {
  const skill = { content: 'Review $ARGUMENTS for bugs' };
  assert.equal(Harness.resolveSkillPrompt(skill, 'this function'), 'Review this function for bugs');
});

test('$ARGUMENTS becomes "(not provided)" when no args given', (t) => {
  const skill = { content: 'Review $ARGUMENTS for bugs' };
  assert.equal(Harness.resolveSkillPrompt(skill, ''), 'Review (not provided) for bugs');
});

test('$ARGUMENTS[n] returns indexed word', (t) => {
  const skill = { content: '$ARGUMENTS[0] is first, $ARGUMENTS[1] second' };
  assert.equal(
    Harness.resolveSkillPrompt(skill, 'hello world'),
    'hello is first, world second'
  );
});

test('$ARGUMENTS[n] returns "(nothing)" for out of bounds index', (t) => {
  const skill = { content: '$ARGUMENTS[5]' };
  assert.equal(
    Harness.resolveSkillPrompt(skill, 'a b c'),
    '(nothing)'
  );
});

test('Non-interpolated skills append args after separator', (t) => {
  const skill = { content: 'Do the thing' };
  const result = Harness.resolveSkillPrompt(skill, 'with extra context');
  assert.equal(
    result,
    'Do the thing\n\n---\nContext from user:\nwith extra context'
  );
});

test('Empty userArgs on non-interpolated skill gets empty line after separator', (t) => {
  const skill = { content: 'Do the thing' };
  const result = Harness.resolveSkillPrompt(skill, '');
  assert.equal(
    result,
    'Do the thing\n\n---\nContext from user:\n'
  );
});

test('Multiple $ARGUMENTS placeholders all resolved', (t) => {
  const skill = { content: '$ARGUMENTS and also $ARGUMENTS' };
  assert.equal(Harness.resolveSkillPrompt(skill, 'foo bar'), 'foo bar and also foo bar');
});

test('$ARGUMENTS[n] with no args returns "(nothing)" for all indices', (t) => {
  const skill = { content: '$ARGUMENTS[0] $ARGUMENTS[1]' };
  assert.equal(Harness.resolveSkillPrompt(skill, ''), '(nothing) (nothing)');
});

test('skill.content without $ARGUMENTS placeholder is preserved verbatim when no args', (t) => {
  const skill = { content: 'Just a plain instruction' };
  assert.equal(
    Harness.resolveSkillPrompt(skill, ''),
    'Just a plain instruction\n\n---\nContext from user:\n'
  );
});

test('null/undefined skill returns empty string', () => {
  assert.equal(Harness.resolveSkillPrompt(null), '');
  assert.equal(Harness.resolveSkillPrompt(undefined), '');
});

test('skill with no content returns empty string', () => {
  assert.equal(Harness.resolveSkillPrompt({}), '');
  assert.equal(Harness.resolveSkillPrompt({ content: null }), '');
  assert.equal(Harness.resolveSkillPrompt({ content: undefined }), '');
});
