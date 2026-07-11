# Fix MinHash Field Bias

## Problem

MinHash shingles each field into character-level n-grams, then takes the min hash across all shingles. Long fields (paths, code strings) produce hundreds of shingles and dominate the min. Short fields (line numbers) produce almost nothing and get ignored.

Result: two reads of the same file with different line ranges produce nearly identical signatures, because the path shingles always win the min.

## Approach

Hash each field **independently** into its own slice of the signature. Each field gets an equal-sized slice (`#NUM_HASHES / numFields` hashes per field), so each field contributes equally to the final signature.

### Example: Read tool (3 fields: path, start_line, end_line)

- Field 0 (path) → hashes 1–42 → signature positions 0–41
- Field 1 (start_line) → hashes 43–84 → signature positions 42–83
- Field 2 (end_line) → hashes 85–126 → signature positions 84–125

### Expected behavior

- `file.js:1-10` vs `file.js:1-20` → path slice matches, line slices differ → ~70% similar
- `fileA:1-10` vs `fileB:1-10` → line slices match, path slice differs → ~67% similar
- `file.js:1-10` vs `other.js:50-100` → all slices differ → ~0% similar

## Implementation Steps

1. **`src/lib/hash.js`**: Modify `Hash.hash()` to hash each field independently into its own slice of the signature array. Each field gets `Math.ceil(#NUM_HASHES / numFields)` hashes.

2. **`src/lib/hash.js`**: Update `Hash.compare()` to compare element-wise (already correct — no change needed).

3. **`src/tools/read.js`**: Verify `normalize()` returns `[path, start_line, end_line]` — already correct.

4. **`src/tools/edit.js`**: Verify `normalize()` returns `[path, old_str, new_str]` — already correct.

5. **`src/tools/grep.js`**: Verify `normalize()` returns `[path, pattern]` — already correct.

6. **Test**: Run a session with multiple reads/edits/greps and verify that `#dupe` no longer flags obviously different calls as duplicates.