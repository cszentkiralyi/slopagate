const test = require('node:test');
const assert = require('node:assert');
const parse = require('../src/lib/bash-parser');

test('parses simple command', (t) => {
  const result = parse('ls');
  assert.strictEqual(result.raw, 'ls');
  assert.strictEqual(result.commands.length, 1);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.deepStrictEqual(result.commands[0].tokens, ['ls']);
});

test('parses compound commands with &&', (t) => {
  const result = parse('ls && git reset --hard HEAD');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.strictEqual(result.commands[1].command, 'git');
  assert.strictEqual(result.commands[1].subcommand, 'reset');
  assert.deepStrictEqual(result.commands[1].flags, ['--hard']);
  assert.deepStrictEqual(result.commands[1].paths, ['HEAD']);
});

test('parses compound commands with ||', (t) => {
  const result = parse('ls || echo "not found"');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.strictEqual(result.commands[1].command, 'echo');
  assert.deepStrictEqual(result.commands[1].paths, ['not found']);
});

test('parses compound commands with ;', (t) => {
  const result = parse('ls ; echo done');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.strictEqual(result.commands[1].command, 'echo');
  assert.deepStrictEqual(result.commands[1].paths, ['done']);
});

test('parses compound commands with |', (t) => {
  const result = parse('ls | grep done');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.strictEqual(result.commands[1].command, 'grep');
  assert.deepStrictEqual(result.commands[1].paths, ['done']);
});

test('parses mixed compound operators', (t) => {
  const result = parse('ls && git reset --hard HEAD ; echo done | grep done');
  assert.strictEqual(result.commands.length, 4);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.strictEqual(result.commands[1].command, 'git');
  assert.strictEqual(result.commands[1].subcommand, 'reset');
  assert.strictEqual(result.commands[2].command, 'echo');
  assert.strictEqual(result.commands[3].command, 'grep');
});

test('handles double quotes', (t) => {
  const result = parse('echo "hello world" && ls');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'echo');
  assert.deepStrictEqual(result.commands[0].paths, ['hello world']);
  assert.strictEqual(result.commands[1].command, 'ls');
});

test('handles single quotes', (t) => {
  const result = parse("ls 'file with spaces'");
  assert.strictEqual(result.commands.length, 1);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.deepStrictEqual(result.commands[0].paths, ['file with spaces']);
});

test('handles escaped quotes inside double quotes', (t) => {
  const result = parse('echo "hello \\"world\\"" && ls');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'echo');
  assert.deepStrictEqual(result.commands[0].paths, ['hello "world"']);
  assert.strictEqual(result.commands[1].command, 'ls');
});

test('handles escaped backslashes', (t) => {
  const result = parse('echo "hello \\\\ world" && ls');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'echo');
  assert.deepStrictEqual(result.commands[0].paths, ['hello \\ world']);
  assert.strictEqual(result.commands[1].command, 'ls');
});

test('handles $() nesting', (t) => {
  const result = parse('echo $(ls $(pwd)) && ls');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'echo');
  assert.deepStrictEqual(result.commands[0].paths, ['$(ls $(pwd))']);
  assert.strictEqual(result.commands[1].command, 'ls');
});

test('handles backtick interpolation', (t) => {
  const result = parse('echo `ls` && ls');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'echo');
  assert.deepStrictEqual(result.commands[0].paths, ['`ls`']);
  assert.strictEqual(result.commands[1].command, 'ls');
});

test('detects subcommands for known compound commands', (t) => {
  const result = parse('git reset --hard HEAD');
  assert.strictEqual(result.commands[0].command, 'git');
  assert.strictEqual(result.commands[0].subcommand, 'reset');
  assert.deepStrictEqual(result.commands[0].flags, ['--hard']);
  assert.deepStrictEqual(result.commands[0].paths, ['HEAD']);
});

test('detects subcommands for npm', (t) => {
  const result = parse('npm install lodash');
  assert.strictEqual(result.commands[0].command, 'npm');
  assert.strictEqual(result.commands[0].subcommand, 'install');
  assert.deepStrictEqual(result.commands[0].paths, ['lodash']);
});

test('detects subcommands for docker', (t) => {
  const result = parse('docker run -it ubuntu');
  assert.strictEqual(result.commands[0].command, 'docker');
  assert.strictEqual(result.commands[0].subcommand, 'run');
  assert.deepStrictEqual(result.commands[0].flags, ['-it']);
  assert.deepStrictEqual(result.commands[0].paths, ['ubuntu']);
});

test('detects flags with --', (t) => {
  const result = parse('ls -la');
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.deepStrictEqual(result.commands[0].flags, ['-la']);
  assert.deepStrictEqual(result.commands[0].paths, []);
});

test('detects flags with --flag=value', (t) => {
  const result = parse('echo --color=always');
  assert.strictEqual(result.commands[0].command, 'echo');
  assert.deepStrictEqual(result.commands[0].flags, ['--color=always']);
  assert.deepStrictEqual(result.commands[0].paths, []);
});

test('detects paths after command', (t) => {
  const result = parse('ls /tmp/foo');
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.deepStrictEqual(result.commands[0].paths, ['/tmp/foo']);
  assert.deepStrictEqual(result.commands[0].flags, []);
});

test('handles empty string', (t) => {
  const result = parse('');
  assert.strictEqual(result.commands.length, 0);
});

test('handles whitespace only', (t) => {
  const result = parse('   ');
  assert.strictEqual(result.commands.length, 0);
});

test('handles only separators', (t) => {
  const result = parse('&& && ; ; |');
  assert.strictEqual(result.commands.length, 0);
});

test('handles newlines as separators', (t) => {
  const result = parse('ls\necho done');
  assert.strictEqual(result.commands.length, 2);
  assert.strictEqual(result.commands[0].command, 'ls');
  assert.strictEqual(result.commands[1].command, 'echo');
  assert.deepStrictEqual(result.commands[1].paths, ['done']);
});

test('preserves raw strings', (t) => {
  const result = parse('ls && git reset --hard HEAD');
  assert.strictEqual(result.commands[0].raw, 'ls');
  assert.strictEqual(result.commands[1].raw, 'git reset --hard HEAD');
});

test('preserves tokens', (t) => {
  const result = parse('git reset --hard HEAD');
  assert.deepStrictEqual(result.commands[0].tokens, ['git', 'reset', '--hard', 'HEAD']);
});
