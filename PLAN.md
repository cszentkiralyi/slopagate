# PLAN.md: Memory System for Slopagate

## Objective
Implement a persistent, LLM-driven memory system for Slopagate that stores and retrieves short, contextual knowledge artifacts. Modeled after Claude Code's memory approach, this system enables the model to recall important information across sessions without bloating context windows, while remaining transparent and controllable for the user.

## Specification Overview
The system consists of five core components: (1) a `.slop/memory/` directory with `MEMORY.md` as an index of summary links to individual <200 token Markdown files; (2) a memory client module handling CRUD operations with optional search; (3) harness-integrated `memory.read()` and `memory.write()` tools callable by the model; (4) basic heuristic triggers for automatic memory writes (context overflow, duplicate mentions); and (5) injection of MEMORY.md summaries into the system prompt for concise retrieval context. Configurable summary length budget and index format.

## Implementation Approach
1. Create `.slop/memory/` directory structure with `MEMORY.md` index template. 2. Build `src/core/memory.js` module with file I/O abstraction, entry management, and search capabilities. 3. Extend `src/lib/harness.js` to register memory tools in the model interface. 4. Modify `src/core/program.js` to load MEMORY.md into system prompt during initialization. 5. Implement heuristic hooks in `src/core/program.js` to detect memory triggers and auto-call write tool. 6. Add `/memory` CLI commands for user interaction. 7. Wire into existing session lifecycle for persistence.

## TODO
- [x] Create `.slop/memory/MEMORY.md` and entry template
- [x] Implement `src/core/memory.js` (CRUD, search)
- [x] Extend `src/lib/harness.js` to expose memory tools
- [x] Wire MEMORY.md loading into system prompt in `src/core/program.js`
- [ ] Implement heuristic triggers in `src/core/program.js`
- [ ] Add `/memory` CLI commands
- [ ] Test end-to-end memory flow