# TODO

## Phase 1: Individual memory files
- [x] Add frontmatter to each memory file with `lastUpdated` (ISO string)
- [x] Add frontmatter parsing to `memory.read()` — strip YAML block before returning content
- [x] Add frontmatter writing to `memory.write()` — prepend YAML block with fresh `lastUpdated` timestamp
- [x] Auto-update `lastUpdated` on every write

## Phase 2: MEMORY.md index
- [x] Rewrite `MEMORY.md` as a flat index: `"- memory.name: memory.description"` per line
- [x] Update `memory.list()` to regenerate `MEMORY.md` from all memory files
- [x] Extract name/description from filename and frontmatter

## Phase 3: Validation
- [ ] Validate frontmatter exists on read — warn if missing (legacy entries)
- [ ] Validate `lastUpdated` is a valid date
- [ ] Add staleness warning to `memory.list()` for entries > 1 day old

## Phase 4: SYSTEM.md integration
- [ ] Add `# MEMORY.md` header to `SYSTEM.md` with sub-prompt describing frontmatter format
- [ ] Guard it like SLOP.md (require explicit user request to modify)
- [ ] Document freshness/staleness behavior in the sub-prompt
