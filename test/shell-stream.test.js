const test = require('node:test');
const assert = require('node:assert');
const { spawnStream } = require('../src/lib/shell-stream');

test('spawnStream calls spawn with command and shell: true', (t) => {
  const handle = spawnStream('echo hello');
  assert.ok(handle.child);
  assert.ok(typeof handle.kill === 'function');
});

test('spawnStream onStdout receives output chunks', async (t) => {
  const chunks = [];
  const handle = spawnStream('echo hello', {
    onStdout: (chunk) => chunks.push(chunk.toString())
  });
  return new Promise((resolve) => {
    handle.child.on('exit', () => {
      assert.ok(chunks.length > 0);
      assert.ok(chunks.join('').includes('hello'));
      resolve();
    });
  });
});

test('spawnStream onStderr receives error output', async (t) => {
  const stderrChunks = [];
  const handle = spawnStream('ls /nonexistent', {
    onStderr: (chunk) => stderrChunks.push(chunk.toString())
  });
  return new Promise((resolve) => {
    handle.child.on('exit', () => {
      assert.ok(stderrChunks.length > 0);
      resolve();
    });
  });
});

test('spawnStream onExit receives captured output', async (t) => {
  const results = [];
  const handle = spawnStream('echo test', {
    onExit: (err, result) => results.push({ err, result })
  });
  return new Promise((resolve) => {
    handle.child.on('exit', () => {
      setTimeout(() => {
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].err, null);
        assert.ok(results[0].result.stdout.includes('test'));
        assert.ok(typeof results[0].result.code === 'number');
        resolve();
      }, 100);
    });
  });
});

test('spawnStream onExit receives error when command fails', async (t) => {
  const results = [];
  const handle = spawnStream('false', {
    onExit: (err, result) => results.push({ err, result })
  });
  return new Promise((resolve) => {
    handle.child.on('exit', () => {
      setTimeout(() => {
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].err, null);
        assert.strictEqual(results[0].result.code, 1);
        resolve();
      }, 100);
    });
  });
});

test('spawnStream kills process on timeout', async (t) => {
  const results = [];
  const handle = spawnStream('sleep 60', {
    onExit: (err) => results.push(err),
    timeoutMs: 1000
  });
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(results.length, 1);
      assert.ok(results[0].message.includes('timed out'));
      resolve();
    }, 2000);
  });
});

test('spawnStream kill() terminates process', async (t) => {
  const results = [];
  const handle = spawnStream('sleep 60', {
    onExit: (err) => results.push(err)
  });
  handle.kill();
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(results.length, 1);
      resolve();
    }, 1000);
  });
});