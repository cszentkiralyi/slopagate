# TODO

## Priority

Finish "read" tool compaction.

1. Finish `unread.js` so it passes all the tests
2. Update `stt.js` so it accepts subcommands instead of always using `replace.js`
3. Add "replace" and "unread" subcommands, rebuild binary
4. Pipe raw history through "unread" before sending via curl or saving to disk

## Backlog

- [ ] What is going on with missing spaces? "Whyaresomeresponseslikethis" apparently *from* the server?
- [ ] Build script, utility extraction, etc
- [ ] Tool use
  - [x] Asking for a tool, then another tool, gives the first tool's response twice
  - [x] `edit`: string replacement ~~range-based insert/replace~~
  - [ ] `ls`: add `-l` flag support or something, and the one that adds `/` after directory names
  - [x] `grep`: create a new tool that's basically just `grep -En --exclude-from=".gitignore" "$1"`
- [ ] /system to refresh system prompts
- [ ] Context compaction (is this just making the LLM summarize the history into one back-and-forth JSON?)
- [ ] Memory (required "edit" tool to be done)
  - [ ] Auto-memory
  - [ ] /init & SLOP.md
- [ ] Up/down history access
- [ ] Loading/thinking animation or indicator

## Finished

- [x] Chat history in Ollama payloads for context
  - I don't think my current off-the-cuff implementation is working
- [x] Track user/model JSON message history to include in chats for context
- [x] Framework refactoring
  - [x] Move system prompt to `SYSTEM.md`, which there can be only one of
  - [x] Support concatenating multiple `SLOP.md` files from various config places
  - [x] Use `~/.slopagate`, not `~/.config/slopagate`
  - [x] Add session-specific subfolders to `.sloptmp/`
- [x] Expand on / rewrite system prompt
- [x] "Truncate" utility that cuts text lines with ... at the start, middle, or end