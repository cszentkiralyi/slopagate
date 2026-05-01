class Timers {
  #timers = new Map();

  start(id, duration, callback) {
    if (this.#timers.has(id)) {
      this.stop(id);
    }
    const timeout = setTimeout(() => {
      this.#timers.delete(id);
      callback();
    }, duration);
    this.#timers.set(id, { timeout, start: Date.now(), duration, elapsed: 0 });
  }

  stop(id) {
    const timer = this.#timers.get(id);
    if (timer) {
      timer.elapsed = (Date.now() - timer.start) + (timer.elapsed || 0);
      clearTimeout(timer.timeout);
      this.#timers.delete(id);
    }
  }

  has(id) {
    return this.#timers.has(id);
  }

  get(id) {
    return this.#timers.get(id);
  }

  clearAll() {
    for (const [, timer] of this.#timers) {
      clearTimeout(timer.timeout);
    }
    this.#timers.clear();
  }
};

module.exports = Timers;