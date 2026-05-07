Here's the full breakdown:

---

## 1. Memory Operations (Tools)

Four tools are exposed to the model, all defined in `memory/tools.py`:

| Tool | What it does |
|---|---|
| **MemorySave** | Creates a new `.md` file with YAML frontmatter (`name`, `description`, `type`, `scope`) in either user or project scope. The index (`MEMORY.md`) is updated automatically. |
| **MemoryDelete** | Deletes a memory file by name, then updates the index. |
| **MemorySearch** | Keyword search across `name` + `description` + `content`. Optional `use_ai=true` triggers a lightweight AI ranking pass on keyword candidates. |
| **MemoryList** | Lists all memories with type, scope, age, freshness, and description. |

The `type` field is strictly one of four: **`user`**, **`feedback`**, **`project`**, **`reference`**. The `scope` is either **`user`** (global, in `~/.little-coder/memory/`) or **`project`** (per-project, in `.little-coder/memory/`).

---

## 2. How the Model Learns About Memories — Two Mechanisms

### Mechanism A: **Eager (System Prompt) Injection**
Every time the system prompt is built (`context.py`), `get_memory_context()` is called. It loads the user-level and project-level `MEMORY.md` index files (each truncated to **1000 lines** or **50 KB**, whichever fires first), concatenates them, and injects them directly into the system prompt:

```
# Memory
Your persistent memories:
[user memories index content]

[Project memories]
[project memories index content]
```

So on *every* turn, the model sees the full index of all memories. It does **not** see the full body of each memory — just the index entries (one-liners with name, description, type, scope, and freshness).

### Mechanism B: **On-Demand Retrieval**
When the model needs deeper context, it calls **MemorySearch** (keyword) or **MemoryList** (browsable). The search returns the full body of matched files. There's also an optional **AI relevance filter** (`use_ai=true`) that sends the keyword candidates to a small model to rank by relevance — useful when you have hundreds of memories and want the top-N most pertinent ones.

---

## 3. Conditional / Smart Injection?

**Mostly no — it's a blunt instrument.** The entire MEMORY.md index gets injected on every turn, period. There's no semantic filtering or "only inject if the conversation topic matches." The only conditional logic is:
- Truncation kicks in if the index exceeds 1000 lines / 50 KB (with a warning appended).
- Memories older than 1 day get a **staleness caveat** ("This memory is 3 days old — verify before acting on it").

The AI relevance filter exists only for **search queries**, not for system prompt injection. So if you have 300 memories, the full index (300 one-liners) gets injected every turn regardless of whether they're relevant.

---

## 4. How the Model Is Instructed to Use Memories

The system prompt template (`context.py` line 40–44) tells the model:

```markdown
## Memory
- **MemorySave**: Save a persistent memory entry (user or project scope)
- **MemoryDelete**: Delete a persistent memory entry by name
- **MemorySearch**: Search memories by keyword (set use_ai=true for AI ranking)
- **MemoryList**: List all memories with type, scope, age, and description
```

Then `memory/types.py` injects a **full memory system guide** into the system prompt:

```markdown
## Memory system

You have a persistent, file-based memory system...

**Types** (save only what cannot be derived from the codebase):
- **user** — role, goals, knowledge, preferences
- **feedback** — guidance on how to work (corrections AND confirmations)
- **project** — ongoing work, decisions, deadlines not in git history
- **reference** — pointers to external systems

**When to save**: If the user corrects you, confirms an approach, or shares context that should persist.

**Body structure for feedback/project**: Lead with the rule/fact, then:
  **Why:** (reason) | **How to apply:** (when this guidance kicks in)

**What NOT to save**: code patterns, architecture, git history, debugging fixes,
anything already in CLAUDE.md, or ephemeral task state.

**Before recommending from memory**: A memory naming a file, function, or flag may be stale.
Verify it still exists before acting on it.
```

**The key behavioral instruction** is: *"save corrections AND quiet confirmations"* — the model is explicitly told to save feedback even when the user doesn't explicitly ask it to. But it's also told to **never** save things derivable from the codebase (architecture, file paths, git history, etc.).

---

## Summary Diagram

```
Model turn
  │
  ├─ System prompt includes MEMORY.md index (all memories, truncated)
  │
  ├─ Model sees index → knows what memories exist
  │
  ├─ If it needs depth: calls MemorySearch / MemoryList (tool)
  │
  ├─ If it wants to save: calls MemorySave (writes .md + updates index)
  │
  └─ If it wants to delete: calls MemoryDelete
```

**Weaknesses**: No semantic pre-filtering, no "memory budget" (the index can grow large), and the 50 KB / 1000 line truncation means old memories at the bottom of the index may never be seen. The AI relevance filter exists only for search, not for injection.
