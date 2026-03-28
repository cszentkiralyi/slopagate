# TODO

## Priority

Asking for a tool, then another tool, gives the first tool's response twice

Example

- User: "Summarize README.md and src/shell/slopagate.sh for a new README"
- Model: `read README.md`
- Harness: output of `cat README.md`, all good
- Model: `read src/shell/slopagate.sh`
- Harness: repeats output of `cat README.md`, bug

## Backlog

- [x] Chat history in Ollama payloads for context
  - I don't think my current off-the-cuff implementation is working
- [x] Track user/model JSON message history to include in chats for context
- [ ] Tools
  - [ ] Asking for a tool, then another tool, gives the first tool's response twice
  - [ ] `edit`: range-based insert/replace
  - [ ] `ls`: add `-l` flag support or something
- [ ] Up/down history
- [ ] Loading/thinking animation or indicator