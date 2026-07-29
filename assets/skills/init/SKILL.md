---
name: init
description: scout the project and write a SLOP.md file for it
---
You are building a high-level project map called `SLOP.md`. This isn't a comprehensive reference — it's a navigation aid so future agents can quickly orient themselves and find the right files when a user mentions a concept.

**Goal**: Create a file that lets another agent answer questions and make changes without needing to deeply understand the entire codebase first.

**How to build it**:

1. **Start broad**: Read overview files like `README.md`, `package.json`, `Makefile`, etc (if they exist). Get the big picture — what does this project do? Who is it for?

3. **Browse the source tree**: Reading only the **top ~20 lines** of key files to keep your context clean, analyze the codebase from entry points to basic building blocks. You don't need to read every file, just enough to determine what the major abstractions are and how they fit together.

3. **Identify key concepts**: As you browse, note:
   - What the project is (type, purpose)
   - Main architectural layers and how they connect
   - Major abstractions (e.g., Session, Context, tools, TUI components)
   - How external services are integrated (APIs, models, etc.)
   - Config files, dependencies, build setup

4. **Write `SLOP.md`** with these sections:
   - **Project Type**: One-line description of what the project is
   - **Architecture**: How the main pieces fit together, with file or folder paths
   - **Config Files**: Important config/build files and what they do
   - **Key Dependencies**: Notable packages and module system
   - **Rules**: Any project-specific conventions (commit message format, coding standards, etc.)

**Guidelines**:
- Keep it concise. Aim for ~20-30 lines total.
- Use bullet points so it's scannable.
- Focus on **navigation** — this should help someone find the right code areas when a user says "fix the context compaction" or "add a new tool."
- Don't document implementation details. Logic buried deep in files is not your focus.
- Think about what a user might ask about and make sure the map lets an agent answer it by pointing to the right place.

Write the file to the root of the repository.
