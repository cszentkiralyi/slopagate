# TODO.md: Heuristics 1.0 for Memory System

## Goal
Make the memory system actively useful by guiding the model to memorize important information and supporting explicit user-triggered saves.

## Tasks

### ✅ 1. Expand Memory Tool Description (DONE)
- **File**: `src/tools/memory.js`
- **Action**: Updated `description` to be a comprehensive guide
- **Content**: Explains when/how to save, when NOT to save, best practices (list first, read before update, descriptive names)

### ✅ 2. Add Memory Guidance to System Prompt (DONE)
- **File**: `src/core/program.js`
- **Action**: After loading SLOP.md files, appends "Memory Guidelines" section to system prompt
- **Impact**: Reinforces memory usage expectations in the model's context

### ✅ 3. Implement Explicit Trigger Detection (DONE)
- **File**: `src/lib/triggers.js`
- **Action**: Updated `MemorySaveTrigger` with broader trigger patterns
- **Trigger phrases**: "remember that/this/:", "note that/this/:", "save this/for later", "keep in mind", "important:", "don't forget"
- **Mechanism**: Fires on `before-send` event, extracts content, writes to memory, auto-generates descriptive filenames

### ✅ 4. Add Auto-Save Notification (DONE)
- **Format**: `"Memory: saved as '<filename>' — <first-line of content>"`

## Dependencies
- `src/tools/memory.js` - needs description expansion
- `src/core/program.js` - needs system prompt injection
- `src/lib/harness.js` - needs trigger detection in `onUserMessage()`
- `src/lib/memory.js` - already functional, no changes needed

## Out of Scope (Future)
- Context window overflow detection → auto-compaction into memory
- Duplicate mention detection across turns
- Automatic summary generation from conversation history
- `/memorize` command to summarize recent context into memory

## Testing
Once done, test:
1. Model proactively saves info via expanded tool description
2. User types "remember that the API endpoint is /api/v2" → auto-saves
3. User types "note: use PostgreSQL for this project" → auto-saves
4. Check `.slop/memory/` for new files and updated `MEMORY.md`
