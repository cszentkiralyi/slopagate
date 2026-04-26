class Config {
  #config

  constructor(config) {
    if (config && typeof config === 'object' && Object.keys(config).length > 0) {
      this.#config = new Map(Object.entries(config))
    } else {
      this.#config = new Map()
    }
  }

  get(k) {
    return this.#config.get(k)
  }

  set(k, v) {
    this.#config.set(k, v)
  }
}

module.exports = { Config }