# Migration Guide: Old Agent to New Agent SSE Infrastructure

## Overview

There are two agent implementations in the codebase:

### Old Implementation (src/core/ai/)
- Limited SSE support
- Basic event types (5 types)
- No planning mode
- Limited state management
- No file tracking
- Basic error handling

### New Implementation (src/core/agent/) ✅ RECOMMENDED
- Complete SSE infrastructure
- 11 event types
- 3 modes (fast/planning/executing)
- Rich state management with selectors
- File change tracking
- Advanced error handling with retry logic
- Comprehensive documentation

## Key Differences

### 1. Event Types

**Old (5 types):**
```typescript
type: 'tool_start' | 'tool_complete' | 'tool_error' | 'status' | 'complete'
```

**New (11 types):**
```typescript
type: 'tool_start' | 'tool_complete' | 'tool_error' | 'iteration_start' |
     'thinking' | 'message' | 'plan_ready' | 'complete' | 'error' |
     'fatal_error' | 'done'
```

### 2. Modes

**Old (2 modes):**
```typescript
type AgentMode = 'fast' | 'planning';
```

**New (3 modes):**
```typescript
type AgentMode = 'fast' | 'planning' | 'executing';
```

### 3. Connection Handling

**Old:**
- Basic fetch with streaming
- Manual abort control
- No automatic reconnection

**New:**
- EventSource API (native SSE)
- Automatic reconnection with exponential backoff
- Proper cleanup and error recovery
- Connection state tracking

### 4. State Management

**Old:**
```typescript
interface AgentState {
  projectId: string | null;
  mode: AgentMode | null;
  isActive: boolean;
  events: ToolEvent[];
  currentTool: string | null;
  status: 'idle' | 'running' | 'complete' | 'error';
  result: any | null;
}
```

**New:**
```typescript
interface AgentState {
  mode: AgentMode | null;
  isRunning: boolean;
  events: ToolEvent[];
  currentTool: string | null;
  plan: Plan | null;              // NEW
  error: string | null;            // NEW
  summary: string | null;          // NEW
  iteration: number;               // NEW
  filesCreated: string[];          // NEW
  filesModified: string[];         // NEW
  currentProjectId: string | null;
  currentPrompt: string | null;    // NEW
  // + 20+ action methods
}
```

### 5. Selectors

**Old:** None

**New:**
```typescript
- getEventsByType(type)
- getEventsByTool(tool)
- getToolErrors()
- hasError()
- isCompleted()
- getStatus()
- getPlanProgress()
- getAllFileChanges()
```

### 6. API

**Old:**
```typescript
const { startStream, stopStream, isStreaming } = useAgentStream({
  onComplete, onError
});

startStream(projectId, mode, prompt);
```

**New:**
```typescript
const { start, stop, reset, isRunning, events, plan, summary } = useAgentStream(mode, {
  onEvent, onComplete, onError
});

start(prompt, projectId);
```

## Migration Steps

### Step 1: Update Imports

**Before:**
```typescript
import { useAgentStream } from '@/core/ai/useAgentStream';
import { useAgentStore } from '@/core/ai/agentStore';
```

**After:**
```typescript
import { useAgentStream } from '@/hooks/api/useAgentStream';
// or
import { useAgentStream } from '@/core/agent';
import { useAgentStore, agentSelectors } from '@/core/agent';
```

### Step 2: Update Hook Usage

**Before:**
```typescript
const { startStream, stopStream, isStreaming, events } = useAgentStream({
  onComplete: (result) => console.log(result),
  onError: (error) => console.error(error)
});

startStream(projectId, 'fast', 'Create component');
```

**After:**
```typescript
const { start, stop, isRunning, events, summary, error } = useAgentStream('fast', {
  onEvent: (event) => console.log(event),
  onComplete: (summary) => console.log(summary),
  onError: (error) => console.error(error)
});

start('Create component', projectId);
```

### Step 3: Update Event Handling

**Before:**
```typescript
events.forEach(event => {
  if (event.type === 'status') {
    // Handle status
  }
});
```

**After:**
```typescript
events.forEach(event => {
  switch (event.type) {
    case 'tool_start':
    case 'tool_complete':
    case 'thinking':
    case 'message':
    case 'plan_ready':
    case 'complete':
      // Handle specific events
      break;
  }
});
```

### Step 4: Use New Features

```typescript
// File tracking
const filesCreated = useAgentStore((state) => state.filesCreated);
const filesModified = useAgentStore((state) => state.filesModified);

// Plan progress
const progress = agentSelectors.getPlanProgress();
// { total, completed, failed, running, pending, percentage }

// Status
const status = agentSelectors.getStatus();
// 'idle' | 'running' | 'error' | 'completed'

// Iteration tracking
const iteration = useAgentStore((state) => state.iteration);
```

### Step 5: Update Store Usage

**Before:**
```typescript
const store = useAgentStore();
store.startSession(projectId, mode);
store.endSession();
```

**After:**
```typescript
const { startAgent, stopAgent, reset } = useAgentStore();
startAgent();
stopAgent();
reset();
```

## Coexistence Strategy

Both implementations can coexist during migration:

1. **New features**: Use new implementation (`src/core/agent/`)
2. **Legacy features**: Keep using old implementation (`src/core/ai/`)
3. **Gradual migration**: Migrate one component at a time
4. **No conflicts**: Different import paths prevent conflicts

## Deprecation Timeline

1. **Phase 1**: New features use new implementation
2. **Phase 2**: Migrate existing features gradually
3. **Phase 3**: Mark old implementation as deprecated
4. **Phase 4**: Remove old implementation

## Benefits of New Implementation

1. ✅ **Better SSE Support**: EventSource API vs manual streaming
2. ✅ **Auto Reconnection**: Exponential backoff with retry logic
3. ✅ **Richer Events**: 11 types vs 5 types
4. ✅ **More Modes**: 3 modes vs 2 modes
5. ✅ **File Tracking**: Track created/modified files
6. ✅ **Plan Management**: Full plan lifecycle support
7. ✅ **Better Errors**: Detailed error tracking and recovery
8. ✅ **Selectors**: Rich query API for derived state
9. ✅ **Documentation**: Comprehensive guides and examples
10. ✅ **Type Safety**: Full TypeScript coverage

## Example Migration

### Before (Old Implementation)

```typescript
import { useAgentStream } from '@/core/ai/useAgentStream';
import { useAgentStore } from '@/core/ai/agentStore';

function OldAgentPanel() {
  const { startStream, stopStream, isStreaming, events } = useAgentStream({
    onComplete: (result) => {
      console.log('Complete:', result);
    }
  });

  const store = useAgentStore();

  const handleStart = () => {
    store.startSession('project-123', 'fast');
    startStream('project-123', 'fast', 'Create component');
  };

  return (
    <div>
      <button onClick={handleStart} disabled={isStreaming}>
        Start
      </button>
      {events.map(e => <div key={e.timestamp}>{e.type}</div>)}
    </div>
  );
}
```

### After (New Implementation)

```typescript
import { useAgentStream } from '@/core/agent';
import { useAgentStore } from '@/core/agent';

function NewAgentPanel() {
  const { start, stop, isRunning, events, summary } = useAgentStream('fast', {
    onEvent: (event) => console.log('Event:', event),
    onComplete: (summary) => console.log('Complete:', summary)
  });

  const filesCreated = useAgentStore((state) => state.filesCreated);

  const handleStart = () => {
    start('Create component', 'project-123');
  };

  return (
    <div>
      <button onClick={handleStart} disabled={isRunning}>
        {isRunning ? 'Running...' : 'Start'}
      </button>

      {/* Events */}
      {events.map(e => (
        <div key={e.id}>
          [{e.type}] {e.tool} - {e.message}
        </div>
      ))}

      {/* File tracking (NEW) */}
      {filesCreated.length > 0 && (
        <div>Created: {filesCreated.join(', ')}</div>
      )}

      {/* Summary (NEW) */}
      {summary && <div>Summary: {summary}</div>}
    </div>
  );
}
```

## Support

- Old implementation: `src/core/ai/` (limited support)
- New implementation: `src/core/agent/` (full support, recommended)

For questions, see:
- `src/core/agent/README.md` - API reference
- `src/core/agent/INTEGRATION_GUIDE.md` - Integration patterns
- `src/core/agent/examples/` - Working examples
