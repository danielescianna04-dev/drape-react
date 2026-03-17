# Interactive PTY Terminal Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real interactive terminal tab with multi-session support, ANSI colors, and accessory keyboard bar.

**Architecture:** WebSocket PTY already exists in backend (index.ts). Frontend connects via existing WS protocol (`terminal_start/input/output/resize`). New tab in sidebar with multi-session tabs. Data encoded as base64 over WebSocket.

**Tech Stack:** React Native, WebSocket (existing), base64 encoding, ANSI parser, Zustand for session state

---

### File Structure

| File | Responsibility |
|------|---------------|
| `src/features/terminal/components/views/InteractiveTerminalView.tsx` | Main view: session tabs + active session |
| `src/features/terminal/components/TerminalSession.tsx` | Single PTY session: output display + input |
| `src/features/terminal/components/TerminalAccessoryBar.tsx` | Special keys bar (Ctrl, Tab, Esc, arrows) |
| `src/features/terminal/hooks/useTerminalPTY.ts` | WebSocket PTY hook (connect, send, receive, resize) |
| `src/features/terminal/utils/ansiParser.ts` | Parse ANSI escape codes → styled segments |
| `src/features/terminal/components/VSCodeSidebar.tsx` | Modify: add terminal icon |
| `src/core/tabs/tabStore.ts` | Modify: no changes needed, `terminal` type already exists |

---

### Task 1: ANSI Parser Utility

**Files:**
- Create: `src/features/terminal/utils/ansiParser.ts`

- [ ] **Step 1: Create ANSI parser**

Parses ANSI escape sequences into styled text segments. Supports: colors (16 + 256 + RGB), bold, dim, underline, reset. Returns array of `{ text, style }` segments.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/features/terminal/utils/ansiParser.ts`

- [ ] **Step 3: Commit**

```bash
git add src/features/terminal/utils/ansiParser.ts
git commit -m "feat(terminal): ANSI escape code parser"
```

---

### Task 2: WebSocket PTY Hook

**Files:**
- Create: `src/features/terminal/hooks/useTerminalPTY.ts`

- [ ] **Step 1: Create PTY hook**

Hook that manages WebSocket connection to existing backend PTY. Uses the existing WS at `config.wsUrl/ws?token=...`. Sends:
- `{ type: 'terminal_start', projectId }` to spawn bash
- `{ type: 'terminal_input', data: base64 }` for keystrokes
- `{ type: 'terminal_resize', cols, rows }` on resize

Receives:
- `{ type: 'terminal_started' }` → set connected
- `{ type: 'terminal_output', data: base64 }` → decode and append to buffer
- `{ type: 'terminal_exit' }` → mark session ended

Returns: `{ output, isConnected, send, resize, connect, disconnect }`

Must handle reconnection and cleanup on unmount.

- [ ] **Step 2: Commit**

```bash
git add src/features/terminal/hooks/useTerminalPTY.ts
git commit -m "feat(terminal): WebSocket PTY hook"
```

---

### Task 3: Terminal Accessory Bar

**Files:**
- Create: `src/features/terminal/components/TerminalAccessoryBar.tsx`

- [ ] **Step 1: Create accessory bar component**

Horizontal bar above keyboard with special keys:
- `Ctrl` (toggle modifier), `Tab`, `Esc`
- Arrow keys: `↑` `↓` `←` `→`
- Common chars: `|`, `/`, `-`, `~`

Props: `onKeyPress: (key: string) => void`

Ctrl works as modifier: tap Ctrl → it highlights → next key sends ctrl sequence (e.g. Ctrl+C = \x03).

Style: dark background matching terminal, compact buttons, monospace labels.

- [ ] **Step 2: Commit**

```bash
git add src/features/terminal/components/TerminalAccessoryBar.tsx
git commit -m "feat(terminal): keyboard accessory bar with special keys"
```

---

### Task 4: Terminal Session Component

**Files:**
- Create: `src/features/terminal/components/TerminalSession.tsx`

- [ ] **Step 1: Create terminal session component**

Single PTY session display:
- `FlatList` (or `ScrollView`) showing parsed ANSI output lines
- Auto-scroll to bottom on new output
- Text rendered in monospace font with ANSI colors via parser
- `TextInput` at bottom (hidden/transparent, captures keyboard input)
- Sends each keystroke immediately via `useTerminalPTY.send()`
- Integrates `TerminalAccessoryBar` as `inputAccessoryView`
- Handles paste from clipboard
- Long-press to select/copy text from output

Props: `projectId: string, sessionId: string, isActive: boolean`

- [ ] **Step 2: Commit**

```bash
git add src/features/terminal/components/TerminalSession.tsx
git commit -m "feat(terminal): PTY session component with ANSI rendering"
```

---

### Task 5: Interactive Terminal View (Multi-Session)

**Files:**
- Create: `src/features/terminal/components/views/InteractiveTerminalView.tsx`

- [ ] **Step 1: Create main terminal view**

Multi-session terminal container:
- Top bar: session tabs `[bash] [bash 2] [+]` with close button on each
- Active session displayed below
- Max 4 sessions per project
- `+` button creates new session
- Tracks sessions in local state: `{ id, title, isConnected }`
- Status indicator per tab: green dot = connected, red = disconnected
- When last session is closed, shows empty state with "New Terminal" button

Props: receives `projectId` from parent (tab data)

- [ ] **Step 2: Commit**

```bash
git add src/features/terminal/components/views/InteractiveTerminalView.tsx
git commit -m "feat(terminal): multi-session interactive terminal view"
```

---

### Task 6: Sidebar Integration

**Files:**
- Modify: `src/features/terminal/components/VSCodeSidebar.tsx`

- [ ] **Step 1: Add terminal icon to sidebar**

Add `terminal-outline` icon in the center section (alongside shell, git, env vars). Handler creates/switches to tab with `type: 'terminal'`, `id: 'interactive-terminal'`.

- [ ] **Step 2: Register view in tab renderer**

Find the component that renders tab content based on `tab.type` and add case for `'terminal'` → `<InteractiveTerminalView projectId={...} />`.

- [ ] **Step 3: Commit**

```bash
git add src/features/terminal/components/VSCodeSidebar.tsx [tab-renderer-file]
git commit -m "feat(terminal): add interactive terminal tab to sidebar"
```

---

### Task 7: Integration Testing & Polish

- [ ] **Step 1: Test full flow**

Open app → navigate to project → click terminal icon → verify:
1. Session tab appears with "bash"
2. WebSocket connects and sends `terminal_start`
3. Typing shows input in terminal
4. Output (ls, pwd, etc.) renders with correct colors
5. Ctrl+C sends interrupt
6. Multiple sessions work
7. Resize on orientation change

- [ ] **Step 2: Final commit**

```bash
git commit -m "feat: interactive PTY terminal with multi-session support"
```
