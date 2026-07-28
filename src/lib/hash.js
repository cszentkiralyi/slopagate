const TRIGRAM_CUTOFF = 200;

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

  static trigrams(str) {
    return Hash.#shingles(str);
  }

  static #buildSignature(shingles, numHashes) {
    const signature = new Array(numHashes).fill(Infinity);
    for (let j = 0; j < numHashes; j++) {
      const seed = j + 1;
      for (const shingle of shingles) {
        const h = Hash.#hash(shingle, seed);
        if (h < signature[j]) signature[j] = h;
      }
    }
    return signature;
  }

  static compare(sig1, sig2) {
    if (!Array.isArray(sig1) || !Array.isArray(sig2)) return 0;
    const len = Math.min(sig1.length, sig2.length);
    if (len === 0) return 0;

    let matches = 0;
    for (let i = 0; i < len; i++) {
      if (sig1[i] === sig2[i]) matches++;
    }
    return matches / len;
  }

  static jaccard(a, b) {
    const setA = a instanceof Set ? a : new Set(a);
    const setB = b instanceof Set ? b : new Set(b);
    let intersection = 0;
    for (const t of setA) {
      if (setB.has(t)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    if (union === 0) return 0;
    return intersection / union;
  }

  /**
   * Cache the similarity representation of text: either trigrams (short)
   * or MinHash signature (long). Callers store this on dedup entries
   * to avoid recomputing per comparison.
   * @param {string} text
   * @returns {{type: 'jaccard', value: Set}|{type: 'minhash', value: number[]}}
   */
  static cache(text) {
    const trigrams = Hash.trigrams(text);
    if (trigrams.length <= TRIGRAM_CUTOFF) {
      return { type: 'jaccard', value: new Set(trigrams) };
    }
    const sig = Hash.#buildSignature(trigrams, Hash.#NUM_HASHES);
    return { type: 'minhash', value: sig };
  }

  /**
   * Compare two cached representations (same type).
   * @param {{type: string, value: any}} a
   * @param {{type: string, value: any}} b
   * @returns {number}
   */
  static cachedSimilarity(a, b) {
    if (!a || !b || a.type !== b.type) return 0;
    if (a.type === 'jaccard') {
      return Hash.jaccard(a.value, b.value);
    }
    if (a.type === 'minhash') {
      return Hash.compare(a.value, b.value);
    }
    return 0;
  }
}

module.exports = { Hash };
