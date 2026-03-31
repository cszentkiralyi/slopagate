# TODO

## Priority

Overhaul `edit` tool.

- Arguments: file_path, old_str, new_str
- Create file if needed
- If old_str = "", just write new_str to the file
- If old_str occurs more than once, error
- Replace old_str with new_str

Milestone prompt:

> Based on the src/ directory and README.md, create a PROJECT.md file that summarizes the project's purpose and structure for another coding agent to read later.

LLMs can handle the actual reading & summarization, the goal is to actually write `PROJECT.md` on disk using `edit`.

## Backlog

- [ ] What is going on with missing spaces? "Whyaresomeresponseslikethis" apparently *from* the server?
- [x] Framework refactoring
  - [x] Move system prompt to `SYSTEM.md`, which there can be only one of
  - [x] Support concatenating multiple `SLOP.md` files from various config places
  - [x] Use `~/.slopagate`, not `~/.config/slopagate`
  - [x] Add session-specific subfolders to `.sloptmp/`
- [ ] Build script, utility extraction, etc
- [ ] Expand on / rewrite system prompt
- [ ] Tool use
  - [x] Asking for a tool, then another tool, gives the first tool's response twice
  - [x] `edit`: string replacement ~~range-based insert/replace~~
  - [ ] `ls`: add `-l` flag support or something, and the one that adds `/` after directory names
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
