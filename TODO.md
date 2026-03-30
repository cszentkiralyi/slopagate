# TODO

## Priority

Implement `edit` tool.

- Arguments: file_path, content, start_line, end_line
- start + end means overwrite range with content
- start-only means insert after start line

Milestone prompt:

> Based on the src/ directory and README.md, create a PROJECT.md file that summarizes the project's purpose and structure for another coding agent to read later.

LLMs can handle the actual reading & summarization, the goal is to actually write `PROJECT.md` on disk using `edit`.

## Backlog

- [ ] What is going on with missing spaces? "Whyaresomeresponseslikethis" apparently *from* the server?
- [ ] Framework refactoring
  - [ ] Move system prompt to `SYSTEM.md`, which there can be only one of
  - [ ] Support concatenating multiple `SLOP.md` files from various config places
  - [ ] Use `~/.slopagate`, not `~/.config/slopagate`
  - [ ] Add session-specific subfolders to `.sloptmp/`
- [ ] Build script, utility extraction, etc
- [ ] Expand on / rewrite system prompt
- [ ] Tool use
  - [x] Asking for a tool, then another tool, gives the first tool's response twice
  - [ ] `edit`: range-based insert/replace
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
