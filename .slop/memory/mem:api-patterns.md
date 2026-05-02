# API Usage Patterns

- Use `/api/generate` for single completions
- Use `/api/chat` for multi-turn conversations
- Always include `system` role with instructions
- Set `stream: true` for real-time output
- Handle `error` responses with retry logic
