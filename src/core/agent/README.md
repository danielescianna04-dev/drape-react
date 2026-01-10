# Agent SSE Infrastructure

Complete infrastructure for streaming agent execution via Server-Sent Events (SSE).

## Architecture

### Components

1. **useAgentStream** (`src/hooks/api/useAgentStream.ts`)
   - React hook for connecting to SSE endpoints
   - Handles streaming events from agent execution
   - Provides event parsing, connection management, and automatic reconnection

2. **agentStore** (`src/core/agent/agentStore.ts`)
   - Zustand store for global agent state
   - Tracks execution mode, events, plans, file changes
   - Provides selectors for common queries

## Usage

### Basic Example - Fast Mode

```typescript
import { useAgentStream } from '@/hooks/api/useAgentStream';

function AgentPanel() {
  const {
    events,
    isRunning,
    currentTool,
    error,
    summary,
    start,
    stop,
    reset
  } = useAgentStream('fast', {
    onEvent: (event) => {
      console.log('Agent event:', event.type, event.tool);
    },
    onComplete: (summary) => {
      console.log('Agent completed:', summary);
    },
    onError: (error) => {
      console.error('Agent error:', error);
    }
  });

  const handleStart = () => {
    const prompt = "Create a new React component";
    const projectId = "my-project-id";
    start(prompt, projectId);
  };

  return (
    <div>
      <button onClick={handleStart} disabled={isRunning}>
        Start Agent
      </button>
      <button onClick={stop} disabled={!isRunning}>
        Stop Agent
      </button>

      {isRunning && (
        <div>Running: {currentTool || 'Starting...'}</div>
      )}

      {error && <div className="error">{error}</div>}
      {summary && <div className="success">{summary}</div>}

      <div className="events">
        {events.map(event => (
          <div key={event.id}>
            [{event.type}] {event.tool} - {event.message}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Planning Mode Example

```typescript
import { useAgentStream } from '@/hooks/api/useAgentStream';
import { useAgentStore } from '@/core/agent/agentStore';

function PlanningPanel() {
  const { plan, start, stop, isRunning } = useAgentStream('planning');
  const planFromStore = useAgentStore((state) => state.plan);

  const handlePlan = () => {
    start("Build a todo app with authentication", "project-123");
  };

  return (
    <div>
      <button onClick={handlePlan} disabled={isRunning}>
        Generate Plan
      </button>

      {plan && (
        <div className="plan">
          <h3>Execution Plan</h3>
          <p>Steps: {plan.steps.length}</p>
          <p>Estimated: {plan.estimatedDuration}s</p>

          <ul>
            {plan.steps.map(step => (
              <li key={step.id}>
                <strong>{step.description}</strong>
                <span className={`status-${step.status}`}>
                  {step.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### Using the Agent Store Directly

```typescript
import { useAgentStore, agentSelectors } from '@/core/agent/agentStore';

function AgentMonitor() {
  // Subscribe to specific state
  const mode = useAgentStore((state) => state.mode);
  const isRunning = useAgentStore((state) => state.isRunning);
  const filesCreated = useAgentStore((state) => state.filesCreated);
  const filesModified = useAgentStore((state) => state.filesModified);

  // Use selectors
  const status = agentSelectors.getStatus();
  const planProgress = agentSelectors.getPlanProgress();
  const toolErrors = agentSelectors.getToolErrors();
  const fileChanges = agentSelectors.getAllFileChanges();

  return (
    <div className="monitor">
      <h3>Agent Status: {status}</h3>
      <p>Mode: {mode}</p>
      <p>Running: {isRunning ? 'Yes' : 'No'}</p>

      {planProgress && (
        <div className="progress">
          <p>Progress: {planProgress.percentage}%</p>
          <p>Completed: {planProgress.completed}/{planProgress.total}</p>
          <p>Running: {planProgress.running}</p>
          <p>Failed: {planProgress.failed}</p>
        </div>
      )}

      <div className="files">
        <h4>Files Changed ({fileChanges.total})</h4>
        <p>Created: {fileChanges.created.length}</p>
        <p>Modified: {fileChanges.modified.length}</p>
      </div>

      {toolErrors.length > 0 && (
        <div className="errors">
          <h4>Tool Errors</h4>
          {toolErrors.map(err => (
            <div key={err.id}>{err.error}</div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Executing a Plan

```typescript
import { useAgentStream } from '@/hooks/api/useAgentStream';

function ExecutionPanel() {
  const planning = useAgentStream('planning');
  const executing = useAgentStream('executing');

  const handleGeneratePlan = () => {
    planning.start("Create user authentication", "project-456");
  };

  const handleExecutePlan = () => {
    if (planning.plan) {
      // Execute the generated plan
      executing.start(
        `Execute plan: ${planning.plan.id}`,
        "project-456"
      );
    }
  };

  return (
    <div>
      <div className="planning">
        <button onClick={handleGeneratePlan}>
          Generate Plan
        </button>
        {planning.plan && (
          <button onClick={handleExecutePlan}>
            Execute Plan
          </button>
        )}
      </div>

      <div className="execution">
        {executing.isRunning && (
          <div>
            Executing: {executing.currentTool}
            <button onClick={executing.stop}>Stop</button>
          </div>
        )}
        {executing.summary && (
          <div className="success">{executing.summary}</div>
        )}
      </div>
    </div>
  );
}
```

## Event Types

### SSE Events

- **tool_start**: Tool execution started
- **tool_complete**: Tool execution completed successfully
- **tool_error**: Tool execution failed
- **iteration_start**: New iteration started (for multi-step tasks)
- **thinking**: Agent is processing/thinking
- **message**: General message from agent
- **plan_ready**: Execution plan generated (planning mode)
- **complete**: Task completed successfully
- **error**: Non-fatal error occurred
- **fatal_error**: Fatal error, execution stopped
- **done**: Stream ended

### Event Structure

```typescript
interface ToolEvent {
  id: string;                 // Unique event ID
  type: AgentEventType;       // Event type
  timestamp: Date;            // When event occurred
  tool?: string;              // Tool name (if applicable)
  input?: any;                // Tool input
  output?: any;               // Tool output
  error?: string;             // Error message
  message?: string;           // General message
  iteration?: number;         // Iteration number
  filesCreated?: string[];    // Files created
  filesModified?: string[];   // Files modified
}
```

## Modes

### Fast Mode (`/agent/run/fast`)
- Direct execution without planning
- Fastest for simple tasks
- No plan generation

### Planning Mode (`/agent/run/plan`)
- Generates execution plan first
- Returns structured plan with steps
- No execution (plan only)

### Executing Mode (`/agent/run/execute`)
- Executes an existing plan
- Requires plan from planning mode
- Tracks progress through plan steps

## Connection Management

The hook automatically handles:
- **Connection**: Opens SSE connection on `start()`
- **Reconnection**: Exponential backoff (max 5 attempts)
- **Disconnection**: Proper cleanup on `stop()` or unmount
- **Error Recovery**: Handles connection failures gracefully

## State Management

### Local State (Hook)
- Events array
- Running status
- Current tool
- Error state
- Plan
- Summary

### Global State (Store)
- Mode
- All events (persistent)
- File tracking (across sessions)
- Plan with step updates
- Iteration count

## Selectors

The store provides helpful selectors:

```typescript
import { agentSelectors } from '@/core/agent/agentStore';

// Get events by type
const toolStarts = agentSelectors.getEventsByType('tool_start');

// Get events by tool
const bashEvents = agentSelectors.getEventsByTool('bash');

// Get all errors
const errors = agentSelectors.getToolErrors();

// Check status
const hasError = agentSelectors.hasError();
const isCompleted = agentSelectors.isCompleted();
const status = agentSelectors.getStatus(); // 'idle' | 'running' | 'error' | 'completed'

// Plan progress
const progress = agentSelectors.getPlanProgress();
// { total, completed, failed, running, pending, percentage }

// File changes
const changes = agentSelectors.getAllFileChanges();
// { created: string[], modified: string[], total: number }
```

## API Endpoints

### Fast Mode
```
GET /agent/run/fast?projectId=xxx&prompt=xxx
```

### Planning Mode
```
GET /agent/run/plan?projectId=xxx&prompt=xxx
```

### Executing Mode
```
GET /agent/run/execute?projectId=xxx&prompt=xxx
```

All endpoints return SSE streams with the event types listed above.

## Error Handling

The infrastructure provides multiple error handling mechanisms:

1. **Connection Errors**: Automatic reconnection with exponential backoff
2. **Tool Errors**: Captured in events and available via selectors
3. **Fatal Errors**: Stop execution and set error state
4. **Callbacks**: `onError` callback for custom error handling

## Best Practices

1. **Use the appropriate mode**: Fast for simple tasks, Planning for complex workflows
2. **Monitor file changes**: Track created/modified files for UI updates
3. **Handle cleanup**: Always call `reset()` when switching contexts
4. **Use selectors**: Leverage store selectors for common queries
5. **Error boundaries**: Wrap components in error boundaries
6. **Loading states**: Show appropriate UI during execution
7. **Abort on unmount**: Hook automatically cleans up on unmount

## Performance

- Events are stored in memory (consider cleanup for long-running sessions)
- Automatic deduplication of file lists
- SSE is more efficient than polling
- Connection pooling handled by EventSource API
- Minimal re-renders with selective subscriptions

## Troubleshooting

### Connection fails immediately
- Check API endpoint configuration in `config.ts`
- Verify CORS settings on backend
- Check network connectivity

### Events not appearing
- Verify backend is sending correct event types
- Check browser console for parsing errors
- Ensure SSE stream format is correct

### Memory issues with long sessions
- Call `reset()` periodically
- Clear events with `clearEvents()`
- Implement event pagination if needed

### Reconnection not working
- Check max retry attempts (default: 5)
- Verify backend is available
- Check network stability
