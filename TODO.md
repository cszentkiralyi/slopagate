# TODO

## Priority

Fix `edit` tool.

After one `edit`, a second `edit` with a distinctly-different new_str will produce no changes but allegedly succeed. Is it not being applied at all, is it applying to the wrong file, what is happening?

Milestone prompt:

> In `src/slopagate.sh` there are tool definitions which are ESCAPED JSON strings, and tool implementations below the header that says that. Add a new tool called "grep" that calls `grep -Fn "$call_pattern" "$call_file"` and uses `jq` to sanitize the output for the result. Escape the pattern with `jq` too, no need to use sed or anything like that.


## Backlog

- [ ] What is going on with missing spaces? "Whyaresomeresponseslikethis" apparently *from* the server?
- [ ] Build script, utility extraction, etc
- [ ] "Truncate" utility that cuts text lines with ... at the start, middle, or end
- [ ] Tool use
  - [x] Asking for a tool, then another tool, gives the first tool's response twice
  - [x] `edit`: string replacement ~~range-based insert/replace~~
  - [ ] `ls`: add `-l` flag support or something, and the one that adds `/` after directory names
  - [ ] `grep`: create a new tool that's basically just `grep -En --exclude-from=".gitignore" "$1"`
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
