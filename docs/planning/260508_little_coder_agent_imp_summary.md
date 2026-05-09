# Agent Class Analysis

## Overview

The `Agent` class (`agent.py`) is the core inference loop of little-coder. It manages the conversation lifecycle: receiving messages, streaming responses from an LLM provider, dispatching tool calls, handling retries, and producing terminal output (Rich-rendered markdown + tool-call UI).

## Construction

```python
Agent(provider, tools=None, on_status_line=None, config=None, on_message=None)
```

| Parameter | Type | Purpose |
|-----------|------|---------|
| `provider` | `BaseProvider` | LLM backend abstraction (Anthropic, OpenAI, Ollama, etc.) |
| `tools` | `Sequence[ToolDef] \| None` | Built-in tools; auto-discovered from `tools.py` if `None` |
| `on_status_line` | `Callable[[str, int], None]` | Callback to update REPL footer with usage info |
| `config` | `dict \| None` | Session config (model, max turns, etc.) |
| `on_message` | `Callable[[str], Coroutine]` | Optional hook to forward messages externally (e.g., Telegram) |

On `__init__`, the agent:
1. Resolves `model_id` from config → provider default.
2. Builds `self.messages` (conversation history) by prepending the system prompt (`context.py`).
3. Registers tool schemas with the provider (`provider.register_tool_schema()`).
4. Installs the default `on_status_line` callback (writes usage summary to stderr).

## Core API

### `add_user_message(content: str)`
Appends a user message to `self.messages` and returns the message index. Called by the CLI REPL or external integrations.

### `run_stream()` → `str`
The main inference loop. Executes one full turn:
1. Calls `provider.run_stream()` with the current `self.messages`.
2. Streams tokens to the terminal (Rich render for markdown, inline code formatting).
3. Collects the full response text.
4. Appends the assistant message to `self.messages`.
5. Returns the response text.

### `run_with_tools()` → `str`
The full agent loop. Repeatedly calls `run_stream()` until the response contains no tool calls. On each iteration:
1. Runs `run_stream()` to get the model's response.
2. If no tool calls → returns the response.
3. If tool calls found → dispatches them, appends tool results to `self.messages`, and loops.

### `run_with_tools_and_retry(max_retries: int = 3)` → `str`
Wraps `run_with_tools()` with retry logic:
1. Calls `run_with_tools()`.
2. If the response is empty, a known bad pattern (loop detection), or quality check fails → retries up to `max_retries` times with a reformulated prompt.
3. Returns the best response or an error message after all retries exhausted.

### `run_command(cmd: str)` → `str`
Executes a slash command (e.g., `/compact`, `/reset`, `/status`). Dispatches to the appropriate handler method.

### `run()` → `str`
Convenience method: calls `run_stream()` then `run_with_tools()` (single pass, no retry).

## Message Management

- `self.messages` is a list of `{"role": str, "content": str}` dicts.
- On init, the system prompt is prepended (from `context.py`'s `build_system_prompt()`).
- User messages are appended via `add_user_message()`.
- Assistant responses and tool results are appended internally.
- The `compact()` method (called via `/compact`) uses `compaction.py` to compress the conversation when it grows too large.

## Tool Dispatch

Tools are defined as `ToolDef` objects in `tool_registry.py` with:
- `name`, `description`, `parameters` (JSON schema), `handler` (async callable).

Built-in tools (from `tools.py`):
| Tool | Handler | Purpose |
|------|---------|---------|
| `bash` | `_run_bash` | Execute shell commands with timeout |
| `read` | `_read_file` | Read file contents with line numbers |
| `write` | `_write_file` | Create/overwrite files (with safety checks) |
| `edit` | `_edit_file` | Exact string replacement in files |
| `glob` | `_glob` | Find files by pattern |
| `grep` | `_grep` | Search file contents with regex |
| `web_fetch` | `_web_fetch` | Fetch URL content |
| `web_search` | `_web_search` | DuckDuckGo search |
| `agent` | `_spawn_agent` | Spawn sub-agent (multi-agent system) |
| `send_message` | `_send_message` | Message a named background agent |
| `check_agent_result` | `_check_agent_result` | Check sub-agent task status |
| `list_agent_tasks` | `_list_agent_tasks` | List sub-agent tasks |
| `list_agent_types` | `_list_agent_types` | List available agent types |
| `memory_save` | `_memory_save` | Save persistent memory |
| `memory_delete` | `_memory_delete` | Delete memory entry |
| `memory_search` | `_memory_search` | Search memories |
| `memory_list` | `_memory_list` | List all memories |
| `skill` | `_skill` | Invoke a skill |
| `skill_list` | `_skill_list` | List available skills |
| `sleep_timer` | `_sleep_timer` | Background timer |
| `task_create` | `_task_create` | Create a task |
| `task_update` | `_task_update` | Update task status |
| `task_get` | `_task_get` | Get task details |
| `task_list` | `_task_list` | List all tasks |

Tool dispatch flow:
1. Parse tool calls from the model's response (provider-specific format).
2. For each tool call: `await tool.handler(**kwargs)`.
3. Collect results as `{"role": "tool", "tool_call_id": ..., "content": ...}` messages.
4. Append to `self.messages` and loop back to the model.

## Streaming & Terminal Output

The agent uses Rich for terminal rendering:
- **Markdown**: Rendered via `rich.markup.Markup` and `rich.console`.
- **Code blocks**: Syntax-highlighted with `rich.syntax`.
- **Tool calls**: Displayed as expandable sections with `rich.panel` and `rich.table`.
- **Streaming**: Tokens are accumulated and flushed incrementally to avoid blocking.

The `on_status_line` callback is called after each turn with a summary string (model, token usage, context %).

## Provider Integration

The `provider` parameter is any `BaseProvider` subclass. The agent:
- Calls `provider.run_stream(messages, tools)` to get an async generator of tokens.
- Calls `provider.get_last_message_text()` to extract the final text response.
- Calls `provider.get_tool_calls()` to extract tool calls from the response.
- Calls `provider.register_tool_schema(tool)` for each tool to register with the LLM.

Supported providers: Anthropic (`AnthropicProvider`), OpenAI (`OpenAIProvider`), Ollama (`OllamaProvider`), llama.cpp (`LlamaCppProvider`), Gemini (`GeminiProvider`), LM Studio (`LMSProvider`), and others.

## Quality & Retry Logic

`run_with_tools_and_retry()` applies these checks:
1. **Empty response**: Model returned nothing → retry with encouragement prompt.
2. **Loop detection**: If the same tool call pattern repeats → retry with a "stop looping" prompt.
3. **Hallucination detection**: If the model references unknown tools → retry with a correction prompt.

Each retry appends a system-level correction message to `self.messages` before re-invoking the provider.

## Slash Commands

Handled by `run_command(cmd)`:
| Command | Handler | Effect |
|---------|---------|--------|
| `/reset` | `_cmd_reset` | Clear conversation history |
| `/compact` | `_cmd_compact` | Compress conversation context |
| `/status` | `_cmd_status` | Print session info |
| `/model` | `_cmd_model` | Change model |
| `/tools` | `_cmd_tools` | List available tools |
| `/help` | `_cmd_help` | Show help |
| `/config` | `_cmd_config` | Show config |
| `/quit` | `_cmd_quit` | Exit |

## Error Handling

- Provider errors are caught and returned as text responses to the user.
- Tool execution errors are caught, formatted, and returned as tool results (not raised).
- The agent never crashes during inference; errors are surfaced to the user gracefully.
- `KeyboardInterrupt` (Ctrl+C) is caught in the CLI loop and handled via `handle_interrupt()`.

## Integration Points

- **CLI** (`little_coder.py`): Creates the Agent, runs the REPL loop, handles user input.
- **Telegram bot** (`telegram_bot.py`): Creates the Agent, uses it for async message handling.
- **Demo** (`demo.py`): Creates the Agent for programmatic use without a REPL.
- **Benchmarks** (`benchmarks/`): Use the Agent for automated evaluation.

## Key Design Decisions

1. **Streaming-first**: All responses stream to the terminal in real-time, not buffered.
2. **Tool-loop**: The agent loops on tool calls automatically; the caller doesn't manage the loop.
3. **Provider-agnostic**: Swap LLM backends by changing the `provider` argument.
4. **Message list as state**: Conversation history is a simple list of dicts, making compaction and debugging straightforward.
5. **Rich terminal UI**: Heavy use of Rich for formatting; the terminal is the primary output surface.
6. **No threading in Agent**: The agent itself is synchronous-async hybrid but doesn't spawn threads. Threading is handled by the CLI REPL or external integrations.