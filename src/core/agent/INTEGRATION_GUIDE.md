# Agent SSE Integration Guide

Complete guide for integrating the Agent SSE infrastructure into your application.

## Quick Start

### 1. Import the Hook

```typescript
import { useAgentStream } from '@/hooks';
// or
import { useAgentStream } from '@/core/agent';
```

### 2. Import the Store

```typescript
import { useAgentStore, agentSelectors } from '@/core/agent';
```

### 3. Use in Component

```typescript
function MyComponent() {
  const { start, isRunning, events } = useAgentStream('fast');

  const handleExecute = () => {
    start("Create a new component", "my-project-id");
  };

  return (
    <button onClick={handleExecute} disabled={isRunning}>
      {isRunning ? 'Running...' : 'Start Agent'}
    </button>
  );
}
```

## Import Patterns

### Individual Imports

```typescript
// Hook only
import { useAgentStream } from '@/hooks/api/useAgentStream';

// Store only
import { useAgentStore } from '@/core/agent/agentStore';

// Selectors only
import { agentSelectors } from '@/core/agent/agentStore';
```

### Centralized Imports

```typescript
// From hooks index
import { useAgentStream, type ToolEvent, type Plan } from '@/hooks';

// From agent index
import {
  useAgentStream,
  useAgentStore,
  agentSelectors,
  type AgentState,
  type ToolEvent,
  type Plan
} from '@/core/agent';
```

## Common Integration Patterns

### Pattern 1: Simple Execution Button

```typescript
import { useAgentStream } from '@/core/agent';

function ExecuteButton({ projectId }: { projectId: string }) {
  const { start, isRunning, error, summary } = useAgentStream('fast');

  return (
    <div>
      <button
        onClick={() => start("Your task here", projectId)}
        disabled={isRunning}
      >
        {isRunning ? 'Executing...' : 'Execute'}
      </button>
      {error && <div className="error">{error}</div>}
      {summary && <div className="success">{summary}</div>}
    </div>
  );
}
```

### Pattern 2: Progress Monitor

```typescript
import { useAgentStore, agentSelectors } from '@/core/agent';

function AgentProgress() {
  const isRunning = useAgentStore((state) => state.isRunning);
  const currentTool = useAgentStore((state) => state.currentTool);
  const iteration = useAgentStore((state) => state.iteration);
  const progress = agentSelectors.getPlanProgress();

  if (!isRunning) return null;

  return (
    <div className="progress">
      <div>Status: Running</div>
      <div>Tool: {currentTool || 'Starting...'}</div>
      <div>Iteration: {iteration}</div>
      {progress && (
        <div>
          Progress: {progress.percentage}%
          ({progress.completed}/{progress.total})
        </div>
      )}
    </div>
  );
}
```

### Pattern 3: Event Stream Display

```typescript
import { useAgentStream, type ToolEvent } from '@/core/agent';

function EventStream() {
  const { events } = useAgentStream('fast', {
    onEvent: (event) => {
      console.log('New event:', event);
    }
  });

  return (
    <div className="events">
      <h3>Events ({events.length})</h3>
      {events.map((event: ToolEvent) => (
        <div key={event.id} className={`event event-${event.type}`}>
          <span className="time">
            {event.timestamp.toLocaleTimeString()}
          </span>
          <span className="type">[{event.type}]</span>
          {event.tool && <span className="tool">{event.tool}</span>}
          {event.message && <span className="msg">{event.message}</span>}
        </div>
      ))}
    </div>
  );
}
```

### Pattern 4: File Change Tracker

```typescript
import { useAgentStore } from '@/core/agent';

function FileChanges() {
  const filesCreated = useAgentStore((state) => state.filesCreated);
  const filesModified = useAgentStore((state) => state.filesModified);

  if (filesCreated.length === 0 && filesModified.length === 0) {
    return null;
  }

  return (
    <div className="file-changes">
      <h4>File Changes</h4>

      {filesCreated.length > 0 && (
        <div className="created">
          <h5>Created ({filesCreated.length})</h5>
          <ul>
            {filesCreated.map((file) => (
              <li key={file}>+ {file}</li>
            ))}
          </ul>
        </div>
      )}

      {filesModified.length > 0 && (
        <div className="modified">
          <h5>Modified ({filesModified.length})</h5>
          <ul>
            {filesModified.map((file) => (
              <li key={file}>~ {file}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### Pattern 5: Plan Viewer

```typescript
import { useAgentStream, type Plan } from '@/core/agent';
import { useAgentStore } from '@/core/agent';

function PlanViewer() {
  const { plan } = useAgentStream('planning');
  const updatePlanStep = useAgentStore((state) => state.updatePlanStep);

  if (!plan) return null;

  return (
    <div className="plan">
      <h3>Execution Plan</h3>
      <p>Total Steps: {plan.steps.length}</p>
      <p>Estimated: {plan.estimatedDuration}s</p>

      <div className="steps">
        {plan.steps.map((step, index) => (
          <div key={step.id} className={`step step-${step.status}`}>
            <div className="step-header">
              <span className="number">{index + 1}</span>
              <span className="description">{step.description}</span>
              <span className="status">{step.status}</span>
            </div>
            {step.tool && (
              <div className="step-tool">Tool: {step.tool}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Pattern 6: Error Handler

```typescript
import { useAgentStream } from '@/core/agent';
import { agentSelectors } from '@/core/agent';

function ErrorDisplay() {
  const { error } = useAgentStream('fast', {
    onError: (err) => {
      // Log to analytics
      console.error('Agent error:', err);
    }
  });

  const toolErrors = agentSelectors.getToolErrors();

  if (!error && toolErrors.length === 0) return null;

  return (
    <div className="errors">
      {error && (
        <div className="fatal-error">
          <h4>Error</h4>
          <p>{error}</p>
        </div>
      )}

      {toolErrors.length > 0 && (
        <div className="tool-errors">
          <h4>Tool Errors ({toolErrors.length})</h4>
          {toolErrors.map((err) => (
            <div key={err.id} className="tool-error">
              <strong>{err.tool}</strong>
              <p>{err.error}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Pattern 7: Multi-Mode Controller

```typescript
import { useState } from 'react';
import { useAgentStream, type AgentMode } from '@/core/agent';

function ModeController({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<AgentMode>('fast');
  const [prompt, setPrompt] = useState('');

  const agent = useAgentStream(mode);

  const handleModeChange = (newMode: AgentMode) => {
    if (agent.isRunning) {
      alert('Cannot change mode while running');
      return;
    }
    setMode(newMode);
    agent.reset();
  };

  const handleExecute = () => {
    agent.start(prompt, projectId);
  };

  return (
    <div>
      <div className="mode-selector">
        <button
          onClick={() => handleModeChange('fast')}
          disabled={mode === 'fast'}
        >
          Fast
        </button>
        <button
          onClick={() => handleModeChange('planning')}
          disabled={mode === 'planning'}
        >
          Planning
        </button>
        <button
          onClick={() => handleModeChange('executing')}
          disabled={mode === 'executing'}
        >
          Executing
        </button>
      </div>

      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter task..."
        disabled={agent.isRunning}
      />

      <button onClick={handleExecute} disabled={agent.isRunning}>
        Execute
      </button>

      {agent.plan && mode === 'planning' && (
        <div>Plan ready with {agent.plan.steps.length} steps</div>
      )}
    </div>
  );
}
```

### Pattern 8: Status Badge

```typescript
import { agentSelectors } from '@/core/agent';

function StatusBadge() {
  const status = agentSelectors.getStatus();

  const styles = {
    idle: { bg: '#6c757d', text: 'Idle' },
    running: { bg: '#007bff', text: 'Running' },
    error: { bg: '#dc3545', text: 'Error' },
    completed: { bg: '#28a745', text: 'Completed' }
  };

  const style = styles[status];

  return (
    <div
      className="status-badge"
      style={{ backgroundColor: style.bg, color: 'white', padding: '4px 8px', borderRadius: '4px' }}
    >
      {style.text}
    </div>
  );
}
```

## Advanced Integration

### Custom Event Filtering

```typescript
import { useAgentStream, type ToolEvent } from '@/core/agent';
import { useMemo } from 'react';

function FilteredEvents() {
  const { events } = useAgentStream('fast');

  const toolEvents = useMemo(
    () => events.filter((e) => e.tool !== undefined),
    [events]
  );

  const errorEvents = useMemo(
    () => events.filter((e) => e.type === 'tool_error' || e.type === 'error'),
    [events]
  );

  return (
    <div>
      <div>Tool Events: {toolEvents.length}</div>
      <div>Errors: {errorEvents.length}</div>
    </div>
  );
}
```

### Persistent State

```typescript
import { useEffect } from 'react';
import { useAgentStore } from '@/core/agent';

function PersistentAgent() {
  const events = useAgentStore((state) => state.events);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('agent-events', JSON.stringify(events));
  }, [events]);

  // Restore on mount
  useEffect(() => {
    const saved = localStorage.getItem('agent-events');
    if (saved) {
      // Restore logic here
    }
  }, []);

  return <div>Events persisted</div>;
}
```

### Real-time Notifications

```typescript
import { useAgentStream } from '@/core/agent';
import { useEffect } from 'react';

function AgentNotifications() {
  const { isRunning, summary, error } = useAgentStream('fast', {
    onEvent: (event) => {
      if (event.type === 'tool_complete') {
        showNotification(`Tool ${event.tool} completed`);
      }
    },
    onComplete: (summary) => {
      showNotification('Task completed!', summary);
    },
    onError: (error) => {
      showNotification('Error occurred', error, 'error');
    }
  });

  function showNotification(title: string, body?: string, type = 'info') {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' });
    }
  }

  return null;
}
```

## Testing

### Mock Hook

```typescript
import { renderHook } from '@testing-library/react';
import { useAgentStream } from '@/core/agent';

describe('useAgentStream', () => {
  it('should start agent execution', () => {
    const { result } = renderHook(() => useAgentStream('fast'));

    result.current.start('test prompt', 'test-project');

    expect(result.current.isRunning).toBe(true);
  });
});
```

### Mock Store

```typescript
import { useAgentStore } from '@/core/agent';

describe('agentStore', () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
  });

  it('should add events', () => {
    const { addEvent } = useAgentStore.getState();

    addEvent({
      id: '1',
      type: 'tool_start',
      timestamp: new Date(),
      tool: 'bash'
    });

    const events = useAgentStore.getState().events;
    expect(events).toHaveLength(1);
  });
});
```

## Performance Tips

1. **Selective Subscriptions**: Only subscribe to needed state
   ```typescript
   const isRunning = useAgentStore((state) => state.isRunning);
   // Not: const { isRunning } = useAgentStore();
   ```

2. **Memoize Selectors**: Use useMemo for derived state
   ```typescript
   const errorCount = useMemo(
     () => events.filter(e => e.type === 'error').length,
     [events]
   );
   ```

3. **Event Cleanup**: Reset events periodically
   ```typescript
   useEffect(() => {
     if (events.length > 1000) {
       clearEvents();
     }
   }, [events.length]);
   ```

4. **Debounce Updates**: Use debouncing for frequent updates
   ```typescript
   import { debounce } from 'lodash';

   const debouncedUpdate = debounce((event) => {
     updateUI(event);
   }, 100);
   ```

## Troubleshooting

### Events Not Appearing
- Check browser console for errors
- Verify SSE endpoint is correct
- Check network tab for event stream

### Memory Leaks
- Ensure components unmount properly
- Call `reset()` when switching contexts
- Clear events periodically

### Type Errors
- Import types from correct locations
- Use explicit type annotations
- Check TypeScript version compatibility

## API Reference

See [README.md](./README.md) for complete API documentation.

## Examples

See [examples/AgentPanel.example.tsx](./examples/AgentPanel.example.tsx) for a complete working example.
