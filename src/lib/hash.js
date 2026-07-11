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
    
    // Each field gets an equal slice of the signature
    const sliceSize = Math.ceil(Hash.#NUM_HASHES / fields.length);
    
    for (let f = 0; f < fields.length; f++) {
      const sliceStart = f * sliceSize;
      const sliceEnd = Math.min(sliceStart + sliceSize, Hash.#NUM_HASHES);
      
      // Hash this field into its slice
      for (let j = sliceStart; j < sliceEnd; j++) {
        const seed = j + 1;
        const shingles = Hash.#shingles(fields[f]);
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
