# Agent System - Quick Start Guide

## What Was Built

A complete agent system integration for AI-powered autonomous task execution with:
- **Fast Mode:** Immediate execution of user requests
- **Planning Mode:** Creates detailed plan, user approves, then executes
- **Real-time progress tracking** with AgentProgress component
- **Plan review & approval** with PlanApprovalModal
- **Project context awareness** for better AI understanding

## Files Created

| File | Purpose |
|------|---------|
| `/src/hooks/useAgentStream.ts` | React hook for agent SSE streaming |
| `/src/shared/components/modals/PlanApprovalModal.tsx` | Modal for plan review/approval |
| `/src/features/terminal/components/AgentChatPanel.tsx` | Complete agent-enabled chat interface |
| `/AGENT_INTEGRATION_GUIDE.md` | Detailed integration instructions |
| `/AGENT_INTEGRATION_SUMMARY.md` | Complete implementation documentation |

## 5-Minute Setup

### 1. Use the AgentChatPanel Component

```tsx
import { AgentChatPanel } from './features/terminal/components/AgentChatPanel';

// Use it anywhere in your app:
<AgentChatPanel
  projectId={currentWorkstation?.id}
  onClose={() => console.log('closed')}
/>
```

That's it! The component includes:
- Mode toggle (AI / Fast / Planning)
- Context loading
- Message history
- Agent progress display
- Plan approval workflow
- All necessary state management

### 2. Backend Requirements

Ensure these endpoints exist:
```
GET  /agent/context/:projectId     - Returns project context
POST /agent/run/fast               - SSE stream for fast mode
POST /agent/run/plan               - SSE stream for planning mode
POST /agent/run/execute            - SSE stream for plan execution
```

All endpoints already implemented in `/backend/routes/agent.js`

### 3. Test It

1. Open AgentChatPanel
2. Toggle to "Fast" or "Planning" mode
3. Send a message like: "Create a new React component called Button"
4. Watch the agent execute in real-time
5. For planning mode: review and approve the plan

## Usage Modes

### AI Mode (Regular Chat)
- Standard chat with AI
- No autonomous execution
- Existing chat functionality

### Fast Mode
- Agent executes immediately
- No confirmation required
- Real-time progress display
- Best for: Quick tasks, file operations, simple requests

### Planning Mode
- Agent creates detailed plan first
- Shows all steps before execution
- User must approve plan
- Then executes approved plan
- Best for: Complex tasks, multi-step operations, safety-critical changes

## Key Components

### useAgentStream Hook
```tsx
const agentStream = useAgentStream();

// Run fast mode
await agentStream.runFast(prompt, projectId);

// Run planning mode
await agentStream.runPlan(prompt, projectId);

// Execute approved plan
await agentStream.executePlan(projectId);

// Check status
agentStream.state.status        // 'idle' | 'running' | 'complete' | 'error'
agentStream.state.events         // All events from agent
agentStream.state.plan           // Current plan (planning mode)
```

### AgentProgress Component
```tsx
import { AgentProgress } from './shared/components/molecules/AgentProgress';

<AgentProgress
  events={agentStream.state.events}
  status={agentStream.state.status}
  currentTool={agentStream.state.currentTool}
/>
```

### PlanApprovalModal
```tsx
import { PlanApprovalModal } from './shared/components/modals/PlanApprovalModal';

<PlanApprovalModal
  visible={showPlanModal}
  plan={agentStream.state.plan}
  onApprove={() => agentStream.executePlan(projectId)}
  onReject={() => agentStream.reset()}
/>
```

## Example User Flows

### Fast Mode Example
```
User: "Create a Button component in src/components/"
  ↓
Agent immediately:
  1. Creates file
  2. Writes component code
  3. Shows completion
```

### Planning Mode Example
```
User: "Build a login form with validation"
  ↓
Agent creates plan:
  - Step 1: Create LoginForm component
  - Step 2: Add form validation
  - Step 3: Add styles
  - Step 4: Write tests
  ↓
User reviews and approves
  ↓
Agent executes all steps
```

## Context Injection

If project has context (`.drape/project.json`):
```json
{
  "name": "My Vape Shop",
  "description": "E-commerce site for vape products",
  "industry": "vape-shop",
  "features": ["cart", "products", "filters"]
}
```

Agent automatically uses this context to generate industry-specific code!

## Visual Indicators

- **Mode Badge:** Shows active agent mode (Fast/Planning)
- **Status Dot:** Pulsing during execution
- **Tool Events:** Real-time display of tools being executed
- **Message Types:** Color-coded (user/agent/assistant/error/system)
- **File Lists:** Shows files created/modified

## Troubleshooting

**Agent doesn't start:**
- Check project ID is valid
- Verify backend is running
- Check browser console for errors

**Context not loading:**
- Project needs `.drape/project.json` file
- Check project ID matches workstation

**SSE stream issues:**
- Check network tab in dev tools
- Verify backend SSE implementation
- Check for CORS issues

## Advanced: Integrate Into Existing Chat

See `/AGENT_INTEGRATION_GUIDE.md` for step-by-step instructions to add agent capabilities to your existing ChatPage.tsx or any chat component.

Key steps:
1. Import useAgentStream hook
2. Add mode toggle UI
3. Modify handleSend to check agent mode
4. Render AgentProgress during execution
5. Add PlanApprovalModal

## Next Steps

1. ✅ **Use AgentChatPanel** - Ready to go!
2. ⏭️ **Customize UI** - Modify styles to match your design
3. ⏭️ **Add to Navigation** - Add panel to your app's navigation
4. ⏭️ **Test Workflows** - Try different types of requests
5. ⏭️ **Monitor Performance** - Check execution times and success rates

## Resources

- **Detailed Guide:** `/AGENT_INTEGRATION_GUIDE.md`
- **Full Documentation:** `/AGENT_INTEGRATION_SUMMARY.md`
- **Backend Code:** `/backend/routes/agent.js`, `/backend/services/agent-loop.js`
- **Existing Component:** `/src/shared/components/molecules/AgentProgress.tsx`

## Support

Questions? Check:
1. Browser/React Native console for frontend errors
2. Backend logs for agent execution errors
3. Network tab for API call issues
4. Integration guides for step-by-step help

---

**TL;DR:** Import `AgentChatPanel`, use it, enjoy autonomous AI agent execution! 🚀
