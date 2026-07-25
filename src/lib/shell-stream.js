const { spawn } = require('node:child_process');

function spawnStream(command, { onStdout, onStderr, onExit, timeoutMs = 60000, throttleMs } = {}) {
  const child = spawn(command, { shell: true });
  let stdoutChunks = [];
  let stderrChunks = [];
  let timedOut = false;
  let intervals = [];

  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    if (onExit) onExit(new Error('Command timed out'));
  }, timeoutMs);

  // throttleMs > 0: wrap callbacks in a setInterval throttle
  // throttleMs === 0: pass through immediately (no throttle)
  const wrapThrottle = (cb, ms) => {
    if (!cb || ms <= 0) return cb;
    let buffer = '';
    const interval = setInterval(() => {
      if (buffer.length > 0 && cb) {
        cb(buffer);
        buffer = '';
      }
    }, ms);
    intervals.push(interval);
    return (chunk) => { buffer += chunk; };
  };

  const throttledStdout = wrapThrottle(onStdout, throttleMs);
  const throttledStderr = wrapThrottle(onStderr, throttleMs);

  child.stdout.on('data', (chunk) => {
    stdoutChunks.push(chunk);
    if (throttledStdout) throttledStdout(chunk);
  });

  child.stderr.on('data', (chunk) => {
    stderrChunks.push(chunk);
    if (throttledStderr) throttledStderr(chunk);
  });

  const cleanup = () => {
    intervals.forEach(clearInterval);
    intervals = [];
  };

  child.on('exit', (code) => {
    clearTimeout(timer);
    cleanup();
    if (timedOut) return;
    if (onExit) onExit(null, {
      stdout: Buffer.concat(stdoutChunks).toString(),
      stderr: Buffer.concat(stderrChunks).toString(),
      code
    });
  });

  child.on('error', (err) => {
    clearTimeout(timer);
    cleanup();
    if (onExit) onExit(err);
  });

  const kill = () => {
    clearTimeout(timer);
    cleanup();
    child.kill('SIGTERM');
  };
  return { child, kill };
}

module.exports = { spawnStream };