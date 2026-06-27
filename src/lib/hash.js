class Hash {
  static #NUM_HASHES = 128;

  static #hash(str, seed) {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
  }

  static #shingles(str, size = 3) {
    const shingles = [];
    for (let i = 0; i <= str.length - size; i++) {
      shingles.push(str.substring(i, i + size));
    }
    return shingles;
  }

  static hash(input) {
    const shingles = Hash.#shingles(input);
    const signature = new Array(Hash.#NUM_HASHES).fill(Infinity);
    for (const shingle of shingles) {
      for (let i = 0; i < Hash.#NUM_HASHES; i++) {
        const h = Hash.#hash(shingle, i + 1);
        if (h < signature[i]) signature[i] = h;
      }
    }
    return signature;
  }

  static compare(sig1, sig2) {
    if (sig1.length !== sig2.length || sig1.length === 0) return 0;
    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] === sig2[i]) matches++;
    }
    return matches / sig1.length;
  }
}

module.exports = { Hash };
