# Agent System Integration Guide

## Overview
This guide explains how to integrate the agent system into the chat interface for AI-powered autonomous task execution.

## Files Created

### 1. useAgentStream Hook (`/src/hooks/useAgentStream.ts`)
- Handles SSE streaming for agent execution
- Supports Fast and Planning modes
- Manages agent state (events, status, current tool, errors)
- Methods: `runFast()`, `runPlan()`, `executePlan()`, `cancel()`, `reset()`

### 2. PlanApprovalModal Component (`/src/shared/components/modals/PlanApprovalModal.tsx`)
- Displays execution plan from planning mode
- Shows steps, estimated files, technologies
- Approve/Reject actions

### 3. AgentProgress Component (Already exists at `/src/shared/components/molecules/AgentProgress.tsx`)
- Displays real-time progress of tool execution
- Shows status indicator and event log

## Integration Steps

### Step 1: Add Agent Mode Toggle to Chat Input

In your chat interface component (e.g., ChatPage.tsx or a new AgentChatPanel.tsx), add:

```tsx
import { useAgentStream } from '../../hooks/useAgentStream';
import { AgentProgress } from '../../shared/components/molecules/AgentProgress';
import { PlanApprovalModal } from '../../shared/components/modals/PlanApprovalModal';
import axios from 'axios';

// Inside your component:
const [agentMode, setAgentMode] = useState<'off' | 'fast' | 'planning'>('off');
const [projectContext, setProjectContext] = useState<any>(null);
const [showPlanModal, setShowPlanModal] = useState(false);
const agentStream = useAgentStream();
```

### Step 2: Load Project Context on Mount

```tsx
useEffect(() => {
  const loadContext = async () => {
    if (!currentWorkstation?.id) return;

    try {
      const response = await axios.get(
        `${process.env.EXPO_PUBLIC_API_URL}/agent/context/${currentWorkstation.id}`
      );
      if (response.data.success) {
        setProjectContext(response.data.context);
        console.log('Loaded project context:', response.data.context);
      }
    } catch (error) {
      console.log('No project context found');
    }
  };

  loadContext();
}, [currentWorkstation?.id]);
```

### Step 3: Add Agent Mode Toggle UI

Replace or enhance the existing mode toggle with:

```tsx
{/* Agent Mode Toggle */}
<View style={styles.agentModeContainer}>
  <TouchableOpacity
    onPress={() => setAgentMode('off')}
    style={[
      styles.agentModeButton,
      agentMode === 'off' && styles.agentModeButtonActive
    ]}
  >
    <Ionicons name="sparkles" size={14} color={agentMode === 'off' ? '#fff' : '#8A8A8A'} />
    <Text style={[styles.agentModeText, agentMode === 'off' && styles.agentModeTextActive]}>
      AI
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => setAgentMode('fast')}
    style={[
      styles.agentModeButton,
      agentMode === 'fast' && styles.agentModeButtonActive
    ]}
  >
    <Ionicons name="flash" size={14} color={agentMode === 'fast' ? '#fff' : '#8A8A8A'} />
    <Text style={[styles.agentModeText, agentMode === 'fast' && styles.agentModeTextActive]}>
      Fast
    </Text>
  </TouchableOpacity>

  <TouchableOpacity
    onPress={() => setAgentMode('planning')}
    style={[
      styles.agentModeButton,
      agentMode === 'planning' && styles.agentModeButtonActive
    ]}
  >
    <Ionicons name="list" size={14} color={agentMode === 'planning' ? '#fff' : '#8A8A8A'} />
    <Text style={[styles.agentModeText, agentMode === 'planning' && styles.agentModeTextActive]}>
      Plan
    </Text>
  </TouchableOpacity>
</View>

{/* Agent Mode Badge */}
{agentMode !== 'off' && (
  <View style={styles.agentModeBadge}>
    <View style={styles.agentModeDot} />
    <Text style={styles.agentModeBadgeText}>
      Agent Mode: {agentMode === 'fast' ? 'Fast' : 'Planning'}
    </Text>
  </View>
)}
```

### Step 4: Update handleSend to Support Agent Mode

```tsx
const handleSend = async () => {
  if (!input.trim() || isLoading) return;

  const userMessage = input.trim();
  const projectId = currentWorkstation?.id || currentWorkstation?.projectId;

  // Check if agent mode is enabled
  if (agentMode !== 'off' && projectId) {
    setInput('');

    // Add user message to chat
    addTerminalItem({
      id: Date.now().toString(),
      content: userMessage,
      type: TerminalItemType.USER_MESSAGE,
      timestamp: new Date(),
    });

    // Build prompt with context
    let enhancedPrompt = userMessage;
    if (projectContext) {
      enhancedPrompt = `Project Context:
Name: ${projectContext.name}
Description: ${projectContext.description}
Industry: ${projectContext.industry}
Features: ${projectContext.features?.join(', ')}

User Request: ${userMessage}`;
    }

    try {
      if (agentMode === 'fast') {
        // Fast mode - execute immediately
        await agentStream.runFast(enhancedPrompt, projectId);
      } else if (agentMode === 'planning') {
        // Planning mode - create plan first
        await agentStream.runPlan(enhancedPrompt, projectId);

        // Show plan modal if plan is ready
        if (agentStream.state.plan) {
          setShowPlanModal(true);
        }
      }
    } catch (error) {
      console.error('Agent execution error:', error);
      addTerminalItem({
        id: (Date.now() + 1).toString(),
        content: `Agent error: ${error.message}`,
        type: TerminalItemType.ERROR,
        timestamp: new Date(),
      });
    }

    return;
  }

  // Normal AI chat mode (existing code)
  // ... rest of your existing handleSend logic
};
```

### Step 5: Render AgentProgress During Execution

```tsx
{/* Show AgentProgress when agent is running */}
{agentStream.state.status === 'running' && (
  <View style={styles.agentProgressContainer}>
    <AgentProgress
      events={agentStream.state.events}
      status={agentStream.state.status}
      currentTool={agentStream.state.currentTool}
    />
  </View>
)}

{/* Show completion summary */}
{agentStream.state.status === 'complete' && agentStream.state.events.length > 0 && (
  <View style={styles.agentCompleteContainer}>
    {agentStream.state.events
      .filter(e => e.type === 'complete')
      .map((event, index) => (
        <View key={index} style={styles.completionCard}>
          <Ionicons name="checkmark-circle" size={24} color={AppColors.primary} />
          <View style={styles.completionContent}>
            <Text style={styles.completionTitle}>Task Completed</Text>
            {event.summary && (
              <Text style={styles.completionSummary}>{event.summary}</Text>
            )}
            {event.filesCreated && event.filesCreated.length > 0 && (
              <Text style={styles.completionFiles}>
                Files created: {event.filesCreated.join(', ')}
              </Text>
            )}
          </View>
        </View>
      ))}
  </View>
)}
```

### Step 6: Add Plan Approval Modal

```tsx
<PlanApprovalModal
  visible={showPlanModal}
  plan={agentStream.state.plan}
  planContent={agentStream.state.events.find(e => e.type === 'plan_ready')?.planContent}
  onApprove={async () => {
    setShowPlanModal(false);
    const projectId = currentWorkstation?.id || currentWorkstation?.projectId;
    if (projectId) {
      try {
        await agentStream.executePlan(projectId);
      } catch (error) {
        console.error('Plan execution error:', error);
        addTerminalItem({
          id: Date.now().toString(),
          content: `Execution error: ${error.message}`,
          type: TerminalItemType.ERROR,
          timestamp: new Date(),
        });
      }
    }
  }}
  onReject={() => {
    setShowPlanModal(false);
    agentStream.reset();
    addTerminalItem({
      id: Date.now().toString(),
      content: 'Plan rejected by user',
      type: TerminalItemType.SYSTEM,
      timestamp: new Date(),
    });
  }}
/>
```

### Step 7: Style Additions

```tsx
const styles = StyleSheet.create({
  // ... existing styles

  agentModeContainer: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.dark.surfaceAlt,
    padding: 2,
    gap: 2,
  },
  agentModeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  agentModeButtonActive: {
    backgroundColor: AppColors.primaryAlpha.a20,
  },
  agentModeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8A8A8A',
  },
  agentModeTextActive: {
    color: '#fff',
  },
  agentModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: AppColors.primaryAlpha.a15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a20,
  },
  agentModeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.primary,
  },
  agentModeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: AppColors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  agentProgressContainer: {
    marginHorizontal: 20,
    marginVertical: 12,
  },
  agentCompleteContainer: {
    marginHorizontal: 20,
    marginVertical: 12,
  },
  completionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    backgroundColor: AppColors.primaryAlpha.a10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: AppColors.primaryAlpha.a20,
  },
  completionContent: {
    flex: 1,
    gap: 6,
  },
  completionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.white.full,
  },
  completionSummary: {
    fontSize: 13,
    color: AppColors.white.w80,
    lineHeight: 18,
  },
  completionFiles: {
    fontSize: 11,
    color: AppColors.white.w60,
    fontFamily: 'monospace',
    marginTop: 4,
  },
});
```

## Backend API Endpoints

The integration expects these endpoints to be available:

- `GET /agent/context/:projectId` - Get project context
- `POST /agent/run/fast` - Run agent in fast mode (SSE stream)
- `POST /agent/run/plan` - Run agent in planning mode (SSE stream)
- `POST /agent/run/execute` - Execute approved plan (SSE stream)

## Example Usage Flow

### Fast Mode:
1. User toggles "Fast" mode
2. User sends message
3. System adds context from `/agent/context/:projectId`
4. Calls `/agent/run/fast` with enhanced prompt
5. AgentProgress shows real-time tool execution
6. Completion summary displays when done

### Planning Mode:
1. User toggles "Planning" mode
2. User sends message
3. System adds context
4. Calls `/agent/run/plan`
5. AgentProgress shows planning progress
6. PlanApprovalModal displays when `plan_ready` event received
7. User approves → calls `/agent/run/execute`
8. AgentProgress shows execution
9. Completion summary displays

## Notes

- Agent mode is optional - existing chat functionality remains intact
- Visual indicators show when agent mode is active
- Context is automatically loaded if available
- Plans can be approved or rejected before execution
- All agent events are logged and displayed in real-time
