# TODO

## Priority

- [ ] tool_error layer needs to be more-gracious about hints, those should stay
      in-context longer than regular "this didn't work" errors
- [ ] Message queue, I think I'm choking Ollama with simultaneous requests
- [ ] User aborts may not be aborting everything they need to, I think our various
      summaries and stuff through back channels still need to be tied to the aborts.
- [ ] Change "x user messages ago" in compact layers to "2-3x messages ago,"
      we don't get enough words in edgewise between tool calls so we have
      to deal with that
- [ ] I think during an agent turn, more than one message might have `done`,
      the spinner is not showing up as consistently as I expected.

## Backlog

- [ ] Security/permissions (nominal, not comprehensive; they're sanity checks)
  - [ ] User approval mechanism w/ session memory (yes, yes for this session, no,
        no for this session)
  - [ ] Gate paths: all paths must be in or below the current directory, and they
        must be specified as relative paths (maybe)
- [ ] Implement compaction layers
  - [ ] `chat_importance` - x in [0,1], y in (0.1, 1]
    `y =  min(1, 1 - (0.9 * e^(-((* x) - 0.5)^2 / (2 * (0.25)^2))))`
  - [x] `chat_summary` - reach out
  - [ ] `system_prompt` - theoretical
  - [x] `tool_age` - tested fine
  - [x] `tool_error`
  - [ ] `tool_length`
  - [ ] `tool_redundancy`
- [ ] Each `edit` file should be a unique temp file; two simultaneous edit calls
      to different files fucked stuff up
- [ ] Context compaction/engineering
  - [ ] unread to compact reads
  - [ ] promptdoc to alter system prompt
  - [ ] scribe to summarize (done automatically on a delay? at certain token
        breakpoints? every n turns? like claude)
- [ ] Tools
  - [x] Go back to global tool 'messages' calls, group them by tool as we iterate
        over them to call them to change the signature to accept n >= 1 calls, and
        e.g. 'read' should make it 'X and n other files'
  - [ ] Dedicated spinner: in addition to the "autofilling" one, between the
        time a tool call starts and the model responds to its response, the tool
        should spin.
        Or maybe just until the tool response goes out?
  - [ ] Replace `ls` with `glob` that uses `find` under the hood?
- [ ] Error handling
  - [ ] Tools
    - [x] Response
    - [ ] UI
  - [ ] Models - UI
  - [ ] Slash commands - UI
- [ ] Up/down history access, it's present but bad
- [ ] `SLOP.md`
- [ ] Wait for `harness:ready`
- [ ] Slash commands
  - [ ] /system to refresh system prompts
  - [ ] /effort maybe
  - [ ] /plan to disable editing tools (need system prompt change?)
  - [ ] others?
- [ ] Autocomplete
  - [ ] Files with @
  - [ ] Slash commands
- [ ] Memory (required "edit" tool to be done)
  - [ ] Auto-memory
  - [ ] /init & SLOP.md
- [ ] Sub-agents for specific tasks
  - Get a subset of context, I guess; maybe even clean slates with minimal prompts
  - E.g. one to sketch out a plan for the main one to follow, one to update SLOP.md,
    that sort of thing
- [ ] Tool calls have been half-heartedtly coralled by a mutex Set, but that
      does not explain why we are executing tool calls twice by responding to
      the `tool:call` message twice.
- [ ] Command-line commands
  - [ ] `history {id}`
    - `less` the history JSON if interactively-called
    - `cat` if non-interactive
    - `--path` argument just returns the path to that history ID JSON file
  - [ ] `help` prints a description of CLI commands, flags, env vars we give
        a shit about, etc
- [ ] Add padding support to containers (no, why?)