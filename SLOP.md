# Slopagate Project Summary

## Project Type
Terminal-based AI coding assistant that uses a local LLM model (qwen3.5:9b-65k) to perform actions like file read/edit, ls, grep operations.

## Architecture
- **Main entry**: `src/slopagate.js`
- **Bundling**: Uses esbuild (via `scripts/sea.sh`) to produce a `slop` binary
- **Model connection**: HTTP endpoint at `http://127.0.0.1:11434/api/chat`

## Source Directory (`src/`)
- `slopagate.js` - Main application, uses TUI (terminal UI) with banners and spinner
- `sea.js` - SEA (Secure Execution Agent) module
- `core/`
  - `interface.js` - CLI interface, message handling, slash commands
  - `program.js` - Main Program class, harness management, event listeners
- `lib/`
  - `ansi.js`, `components/`, `context.js`, `harness.js`, `layers/`, `sd.js`, `session.js`, `timers.js` - Timers class for managing scheduled callbacks and timers, `toolbox.js`, `tui.js`
- `tools/` - CLI tools: bash, edit, grep, ls, read, tool.js

## Documentation (`docs/`)
- `TODO.md` - Priority items: error pruner, interface modes, argument hinting, session history, context compaction, slash commands
- `FLAWS.md` - Known issues: double edits, models rewriting whole files, context management
- `planning/`
  - `220422_refactor.md` - Context window management, message importance curves, tool call optimization
  - `220424_compact.md` - (content not readable)

## Config Files
- `package.json` - Node.js project, main: `src/slopagate.js`, scripts: dev, build, clean, test
- `sea.json` - SEA config for bundling
- `scripts/sea.sh` - Build script using esbuild

## License
MIT (c) 2026 Chris Szentkiralyi

## Key Dependencies
- `esbuild` ^0.28.0 (devDependency)
- CommonJS module system

## Environment Variables
- `PWD` - Root directory
- `SLOP_PROJECT_DIR` - Slop directory
- `SLOP_PORT`, `SLOP_HOST`, `SLOP_ENDPOINT` - Model connection settings
- `SLOP_MODEL`, `SLOP_CONTEXT_WINDOW` - Model config
- `HOME/.slopagate` - System prompt location

## Slash Commands
- `quit` - Exit
- `think` - Toggle thinking mode
- History commands: `history {id}`
- `/system` - Refresh system prompts
- `/init` - Initialize from SLOP.md
