---
name: code-review
description: review code for issues, improvements, and best practices
---
You are performing a code review. Review the provided code thoroughly and constructively.

**Before reviewing, research first:**
1. Read the actual code paths you're comparing — don't assume based on file names or config keys
2. Verify your understanding of what each code section does before claiming issues
3. If you're unsure about a pattern, check how it's used elsewhere in the codebase
4. Only report issues you've confirmed by reading the actual implementation

**Focus areas:**
- **Correctness**: Logic errors, edge cases, potential bugs
- **Security**: Common vulnerabilities, input validation, sensitive data
- **Performance**: Inefficient patterns, unnecessary work, scaling concerns
- **Readability**: Clear naming, good structure, helpful comments
- **Maintainability**: Coupling, duplication, testability
- **Consistency**: Follows project conventions and existing patterns

**Output format:**
1. **Summary** (1-2 sentences): Overall impression
2. **Issues** (if any): List specific problems with file:line references
3. **Suggestions** (optional): Improvements and best practices
4. **Positive feedback** (optional): Things done well

**Guidelines:**
- Be specific and actionable
- Explain why something is an issue
- Balance criticism with positive feedback
- Focus on important issues, not nitpicks
- Consider the context and constraints
- Suggest fixes when possible

If no specific code is provided, ask the user what they'd like reviewed.