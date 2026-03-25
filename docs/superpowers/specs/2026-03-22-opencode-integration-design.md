# OpenCode Integration Design

**Date:** 2026-03-22
**Status:** Approved

## Summary

Replace Drape's custom agent loop with OpenCode (MIT licensed, open-source AI coding agent) running inside user project containers. OpenCode handles all AI interactions, tool execution, and file operations. The backend acts as an adapter translating OpenCode's JSON output into Drape's existing SSE event format. The frontend remains unchanged.

## Architecture

```
User (mobile app) → SSE POST /agent/run/fast → Backend Drape (adapter) → HTTP to OpenCode serve (:4096 in container) → OpenCode executes tools → Streaming JSON → Backend translates → SSE events → Frontend (unchanged)
```

## Key Decisions

1. **OpenCode mode:** `opencode serve` + `opencode run --attach` (persistent server, zero cold start)
2. **Migration:** Full replacement, no fallback to old agent
3. **Adapter location:** Backend translates OpenCode JSON → Drape SSE events. Frontend unchanged.
4. **Sessions:** One OpenCode session per project. "New Chat" creates new session.
5. **Config:** `opencode.json` for global config + `AGENTS.md` for per-project instructions

## Components Modified

### Removed
- `agent-loop.service.ts` — replaced by OpenCode
- `agent-tools.service.ts` — replaced by OpenCode built-in tools
- `tools/index.ts` — replaced by OpenCode tools
- `claude-code-system-prompt.txt` — replaced by opencode.json + AGENTS.md

### Added
- `opencode-adapter.service.ts` — translates OpenCode JSON → Drape SSE events
- `opencode.json` template — global config for containers
- `AGENTS.md` per template — stack-specific instructions

### Modified
- `Dockerfile.workspace` — install opencode-ai, copy config
- `agent.routes.ts` — route to OpenCode adapter instead of agent loop
- Container startup — launch `opencode serve` on boot

### Unchanged
- Frontend (ChatPage, useChatEngine, useAgentStream)
- SSE event format (25 event types)
- WebSocket terminal (PTY)
- Project creation flow (templates + AI generation)
- Model selection UI

## Event Mapping

| OpenCode | Drape SSE |
|---|---|
| content_delta | text_delta |
| tool_call start | tool_start + tool_input |
| tool_result | tool_complete / tool_error |
| thinking | thinking |
| usage/tokens | usage |
| completion | complete + done |
| error | error |

## Model Mapping

| Drape UI | OpenCode --model |
|---|---|
| Gemini 3.0 Flash | google/gemini-3-flash |
| Gemini 3.1 Pro | google/gemini-3.1-pro |
| Claude 4.6 Sonnet | anthropic/claude-sonnet-4-6 |
| Claude 4.6 Opus | anthropic/claude-opus-4-6 |
| GPT 5.3 | openai/gpt-5.3 |

## Config

```jsonc
{
  "model": "google/gemini-3-flash",
  "agent": {
    "build": {
      "tools": ["edit", "write", "bash", "glob", "grep", "read", "webfetch"],
      "system": "Mobile-first coding assistant. Preview runs on 390px phone. Use Italian for UI text."
    }
  },
  "mode": {
    "acceptEdits": {
      "permission": { "edit": "always", "write": "always", "bash": "always" }
    }
  },
  "instructions": ["AGENTS.md"]
}
```

## Risks

| Risk | Mitigation |
|---|---|
| Output format changes between versions | Pin version in package.json |
| OpenCode serve crashes | Auto-restart wrapper script |
| Undocumented JSON format | Extensive testing before launch |
| Cold start | Serve starts at container boot |
