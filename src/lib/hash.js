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

  static hash(fields) {
    const signature = new Array(Hash.#NUM_HASHES).fill(Infinity);
    
    // Use consistent seeds across all fields so identical content produces identical hashes
    for (let j = 0; j < Hash.#NUM_HASHES; j++) {
      const seed = j + 1;
      for (const field of fields) {
        const shingles = Hash.#shingles(field);
        for (const shingle of shingles) {
          const h = Hash.#hash(shingle, seed);
          if (h < signature[j]) signature[j] = h;
        }
      }
    }

    return signature;
  }

  static compare(sig1, sig2) {
    if (!Array.isArray(sig1) || !Array.isArray(sig2)) return 0;
    const len = Math.min(sig1.length, sig2.length);
    if (len === 0) return 0;
    
    // Compare within each field's slice independently.
    // This preserves the field-specific semantics of the hash.
    // For now, treat all positions equally (single field per signature).
    let matches = 0;
    for (let i = 0; i < len; i++) {
      if (sig1[i] === sig2[i]) matches++;
    }
    return matches / len;
  }
}

module.exports = { Hash };
