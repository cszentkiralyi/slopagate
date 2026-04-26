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
    this.#timers.set(id, timeout);
  }

  stop(id) {
    const timeout = this.#timers.get(id);
    if (timeout) {
      clearTimeout(timeout);
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
    for (const [id, timeout] of this.#timers) {
      clearTimeout(timeout);
    }
    this.#timers.clear();
  }
};

module.exports = Timers;