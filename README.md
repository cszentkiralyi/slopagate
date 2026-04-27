# Slopagate

> A coding agent harness similar to OpenCode or Claude Code, but much worse.

It provides a terminal-based interface for AI-driven development, executing file operations like read, edit, grep, and ls. Uses a configurable local LLM model to power its intelligence.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Source Directory](#source-directory)
- [Documentation](#documentation)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Slash Commands](#slash-commands)
- [Quick Start](#quick-start)
- [Dependencies](#dependencies)
- [License](#license)

## Overview

Slopagate is a terminal-based AI coding assistant that leverages a local LLM to perform file operations within your development environment. It runs entirely locally, respecting your system boundaries while providing an interactive TUI (Terminal User Interface) that displays progress, manages sessions, and executes commands through a model-driven agent system.

Think of it as your own local OpenCode or Claude Code—but with the same functionality minus the polish, occasional correctness, and actual intelligence.

## Architecture

The application follows a modular architecture:

- **Main Entry**: [`src/slopagate.js`](src/slopagate.js)
- **Bundling**: Uses esbuild (via `scripts/sea.sh`) to produce a self-executing `slop` binary
- **Model Connection**: HTTP endpoint at `http://127.0.0.1:11434/api/chat` for model interactions

### Core Modules

- `src/program.js` - Main Program class, event listeners, harness management
- `src/sea.js` - Secure Execution Agent (SEA) module for sandboxed execution
- `src/core/interface.js` - CLI interface, message handling, slash commands
- `src/lib/` - Utility modules including timers, TUI components, context management
- `src/tools/` - CLI tool wrappers for bash, edit, grep, ls, read operations

## Source Directory

The `src/` directory contains the application source code organized by responsibility:

### Main Application

- `slopagate.js` - Entry point, TUI initialization, main loop
- `sea.js` - SEA module for secure agent execution

### Core (`src/core/`)

- `interface.js` - Handles CLI output, messages, and slash command routing
- `program.js` - Program orchestrator, event listeners, harness logic

### Library (`src/lib/`)

- `ansi.js` - ANSI color codes and formatting utilities
- `components/` - Reusable TUI components
- `context.js` - Context window management and compression
- `harness.js` - Harness orchestration logic
- `layers/` - UI layer management
- `sd.js` - Session data handling
- `session.js` - Session state management
- `timers.js` - Scheduled callbacks and timer utilities
- `toolbox.js` - General utility functions
- `tui.js` - Terminal UI rendering and state

### Tools (`src/tools/`)

CLI tool wrappers:
- `bash`, `edit`, `grep`, `ls`, `read` - Shell command interface
- `tool.js` - Base tool implementation

## Documentation

See [`SLOP.md`](SLOP.md) for the full project summary, known issues, and development notes. The `docs/` directory contains additional planning documents and TODO items.

### Available Docs

- `docs/TODO.md` - Priority items and feature requests
- `docs/FLAWS.md` - Known issues and limitations
- `docs/planning/` - Architectural decisions and optimizations

## Configuration

Configure Slopagate using environment variables and optional JSON config files:

- `package.json` - Node.js project configuration
- `sea.json` - SEA bundling configuration
- `scripts/sea.sh` - Build script using esbuild

### Model Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `SLOP_MODEL` | Model name for API calls | `qwen3.5:9b-65k` |
| `SLOP_CONTEXT_WINDOW` | Maximum context tokens | `128000` |

### Connection Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `SLOP_PORT` | Local LLM server port | `11434` |
| `SLOP_HOST` | Local LLM server hostname | `127.0.0.1` |
| `SLOP_ENDPOINT` | Full API endpoint URL | `/api/chat` |

### Directory Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `PWD` | Root working directory | Current directory |
| `SLOP_PROJECT_DIR` | Slop-specific directory | `.` |
| `HOME/.slopagate` | System prompt storage | User home |

## Environment Variables

### Runtime

- `PWD` - Working directory (automatically set by shell)
- `SLOP_PROJECT_DIR` - Project-specific slop directory

### Model & Connection

- `SLOP_PORT` - Local LLM server port
- `SLOP_HOST` - Local LLM server hostname
- `SLOP_ENDPOINT` - Full API endpoint URL

### Model Configuration

- `SLOP_MODEL` - Model identifier for API calls
- `SLOP_CONTEXT_WINDOW` - Maximum context window size

### System Paths

- `HOME/.slopagate` - System prompt location

## Slash Commands

Interact with the agent through terminal slash commands:

| Command | Description |
|---------|-------------|
| `/quit` | Exit the application |
| `/think` | Toggle thinking mode |
| `/history {id}` | View session history by ID |
| `/system` | Refresh system prompts |
| `/init` | Initialize from SLOP.md |

## Quick Start

1. Ensure an LLM server is running (e.g., LM Studio, Ollama)
2. Configure environment variables if needed
3. Run the development server:

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Clean Build Artifacts

```bash
npm run clean
```

## Dependencies

### Runtime

No external runtime dependencies required.

### Development

- `esbuild` ^0.28.0 - Build tool for bundling

### Notes

Uses CommonJS module system. The application is designed to run in a terminal environment with no browser dependencies.

## License

MIT License (c) 2026 Chris Szentkiralyi

---

**Note:** This is a terminal-based AI coding assistant. While it provides similar functionality to cloud-based solutions like OpenCode or Claude Code, it runs entirely locally using your chosen model. Expect occasional quirks, but it's yours, yours alone.
