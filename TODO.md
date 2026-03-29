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

- [x] Chat history in Ollama payloads for context
  - I don't think my current off-the-cuff implementation is working
- [x] Track user/model JSON message history to include in chats for context
- [ ] What is going on with missing spaces? "Whyaresomeresponseslikethis?"
- [ ] Tools
  - [x] Asking for a tool, then another tool, gives the first tool's response twice
  - [ ] `edit`: range-based insert/replace
  - [ ] `ls`: add `-l` flag support or something
- [ ] Up/down history
- [ ] Loading/thinking animation or indicator