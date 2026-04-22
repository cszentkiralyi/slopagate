# TODO

## Priority

- `grep` tool


## Backlog

- [ ] Save session history more-often
  - Every model response with content?
  - Every `done` model response?
  - Every few minutes?
- [ ] Tools
  - [ ] `edit`:
    - [x] File creation is borked
    - [ ] We aren't showing diffs (later, these should expand/collapse)
  - [x] `read`: we aren't showing line numbers
  - [ ] `ls`
  - [ ] `grep`
  - [ ] Dedicated spinner: in addition to the "autofilling" one, between the
        time a tool call starts and the model responds to its response, the tool
        should spin.
        Or maybe just until the tool response goes out?
- [ ] Error handling
  - [ ] Tools
    - [x] Response
    - [ ] UI
  - [ ] Models - UI
  - [ ] Slash commands - UI
- [ ] `SLOP.md`
- [ ] Up/down history access, it's present but bad
- [ ] Fix whatever the heck is going on with abort draws, we don't reliably
      redraw after hiding the spinner & showing the abort message.
- [ ] Add padding support to containers
- [ ] Wait for `harness:ready`
- [ ] Shell shortcut: `!` which should change the prompt
- [ ] Slash commands
  - [ ] /system to refresh system prompts
  - [ ] /think to toggle thinking
  - [ ] /effort maybe
  - [ ] /plan to disable editing tools (need system prompt change?)
- [ ] Autocomplete
  - [ ] Files with @
  - [ ] Slash commands
- [ ] Context compaction/engineering
  - [ ] unread to compact reads
  - [ ] promptdoc to alter system prompt
  - [ ] scribe to summarize (done automatically on a delay? like claude)
  - [ ] others?
- [ ] Memory (required "edit" tool to be done)
  - [ ] Auto-memory
  - [ ] /init & SLOP.md
- [ ] Auto-summarize after being idle & at certain points (e.g. Claude uses
      "approaching context window limit" as a trigger)
  [ ] Tool calls have been half-heartedtly coralled by a mutex Set, but that
      does not explain why we are executing tool calls twice by responding to
      the `tool:call` message twice.