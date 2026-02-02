# Agent System Documentation

This document describes the AI agent system architecture for the Drape backend.

## Overview

The agent system implements a ReAct-style (Reasoning + Acting) loop that allows AI models to:
- Read and write files in the project
- Execute commands in the container
- Search code using glob patterns and grep
- Track progress with todos
- Ask users for clarification
- Complete multi-step coding tasks

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Loop Service                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Build system prompt with project context           │ │
│  │ 2. Call AI model with tools (streaming)               │ │
│  │ 3. Receive text + tool calls                          │ │
│  │ 4. Execute tools via Agent Tools Service              │ │
│  │ 5. Feed results back to AI                            │ │
│  │ 6. Repeat until completion (max 50 iterations)        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
┌────────▼──────────┐                  ┌──────────▼────────────┐
│ AI Provider       │                  │ Agent Tools Service   │
│ Service           │                  │                       │
│ - Anthropic       │                  │ Dispatches to:        │
│ - Gemini          │                  │ - write_file          │
│ - Groq            │                  │ - read_file           │
│                   │                  │ - edit_file           │
│ Streaming support │                  │ - list_directory      │
│ Tool calling      │                  │ - run_command         │
└───────────────────┘                  │ - glob_search         │
                                       │ - grep_search         │
                                       │ - web_search          │
                                       │ - todo_write          │
                                       │ - ask_user_question   │
                                       │ - signal_completion   │
                                       └───────────────────────┘
                                                  │
                  ┌───────────────────────────────┼──────────────────────┐
                  │                               │                      │
         ┌────────▼──────────┐         ┌─────────▼────────┐  ┌─────────▼────────┐
         │ File Service      │         │ Docker Service   │  │ Tool Implementations│
         │                   │         │                  │  │                      │
         │ - readFile()      │         │ - exec()         │  │ - globSearch()       │
         │ - writeFile()     │         │ - waitForAgent() │  │ - grepSearch()       │
         │ - listFiles()     │         └──────────────────┘  │ - webSearch()        │
         │ - notifyAgent()   │                               │ - writeTodos()       │
         └───────────────────┘                               └──────────────────────┘
```

## File Structure

```
src/
├── tools/
│   ├── index.ts           # Tool registry with all tool definitions
│   ├── glob.ts            # Glob pattern file search
│   ├── grep.ts            # Text search in files
│   ├── web-search.ts      # Web search (placeholder)
│   └── todo-write.ts      # Todo list management
│
├── services/
│   ├── agent-loop.service.ts      # Main ReAct loop
│   ├── agent-tools.service.ts     # Tool dispatcher
│   └── ai-provider.service.ts     # Multi-provider AI client
│
└── types/
    └── agent.ts           # Agent-related type definitions
```

## Key Components

### 1. Tool Registry (`tools/index.ts`)

Defines all available tools in OpenAI-compatible format:

```typescript
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'write_file',
    description: 'Write content to a file...',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '...' },
        content: { type: 'string', description: '...' },
        description: { type: 'string', description: '...' },
      },
      required: ['file_path', 'content', 'description'],
    },
  },
  // ... 10 more tools
];
```

### 2. Agent Tools Service (`services/agent-tools.service.ts`)

Dispatches tool calls to implementations:

```typescript
class AgentToolsService {
  async executeTool(
    toolName: string,
    input: any,
    projectId: string,
    session?: Session
  ): Promise<ToolResult> {
    switch (toolName) {
      case 'write_file':
        return await this.writeFile(projectId, input, session);
      case 'read_file':
        return await this.readFile(projectId, input);
      // ... other tools
    }
  }
}
```

### 3. Agent Loop Service (`services/agent-loop.service.ts`)

Main reasoning loop:

```typescript
export class AgentLoop {
  async *run(prompt: string, images?: Array<{...}>): AsyncGenerator<AgentEvent> {
    // 1. Ensure container exists
    this.session = await workspaceService.getOrCreateContainer(this.projectId);

    // 2. Build system prompt with project context
    const systemPrompt = await this.buildSystemPrompt();

    // 3. Main loop (max 50 iterations)
    while (shouldContinue && this.iterationCount < MAX_ITERATIONS) {
      // a. Call AI model (streaming)
      for await (const chunk of aiProviderService.chatStream(...)) {
        // Yield text_delta, thinking, tool_start events
      }

      // b. Execute tool calls
      for (const toolCall of toolCalls) {
        const result = await agentToolsService.executeTool(...);
        // Yield tool_complete event

        // Handle special tools
        if (result._pauseForUser) {
          yield { type: 'ask_user_question', questions: ... };
          return; // Pause until user responds
        }

        if (result._completion) {
          yield { type: 'complete', ... };
          return;
        }
      }

      // c. Add tool results to conversation and continue
    }
  }
}
```

## Tool Implementations

### File Operations

- **write_file**: Creates/overwrites files, notifies agent for hot reload
- **read_file**: Reads file contents, handles binary files
- **edit_file**: Replaces exact string matches in files
- **list_directory**: Lists files/directories, supports recursive mode

### Code Search

- **glob_search**: Uses `fast-glob` for pattern matching (`**/*.ts`, etc.)
- **grep_search**: Searches text in files with exclusions

### Execution

- **run_command**: Executes shell commands in container via agent HTTP API

### Meta Tools

- **todo_write**: Updates in-memory task list, yields todo_update events
- **ask_user_question**: Pauses loop for user input
- **signal_completion**: Marks task as complete with summary
- **web_search**: Placeholder for external search (not yet implemented)

## Agent Modes

The system supports three modes:

### Fast Mode
- Prioritize speed over thoroughness
- Make reasonable assumptions
- Skip verbose explanations
- Use most direct approach

### Plan Mode
- Analyze request thoroughly
- Break down into clear steps
- Use todo_write to structure plan
- Don't execute - just plan
- Ask clarifying questions
- Signal completion when plan is ready

### Execute Mode
- Execute steps methodically
- Update todo list as progress
- Verify each step before next
- Handle errors gracefully
- Provide detailed progress

## Event Streaming

The agent emits events as it works:

```typescript
type AgentEvent =
  | { type: 'start'; mode: string; projectId: string; model: string }
  | { type: 'iteration_start'; iteration: number; maxIterations: number }
  | { type: 'thinking'; text: string; start?: boolean; end?: boolean }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_input'; id: string; name: string; input: any }
  | { type: 'tool_complete'; id: string; name: string; result: string; success: boolean }
  | { type: 'tool_error'; id: string; name: string; error: string }
  | { type: 'todo_update'; todos: Todo[] }
  | { type: 'ask_user_question'; questions: string[] }
  | { type: 'complete'; result: string; filesCreated: string[]; filesModified: string[]; tokensUsed: {...}; iterations: number }
  | { type: 'budget_exceeded'; message: string; iterations: number }
  | { type: 'error'; error: string }
  | { type: 'fatal_error'; error: string; stack: string }
```

## Usage Example

```typescript
import { AgentLoop } from './services/agent-loop.service';

const agent = new AgentLoop({
  projectId: 'my-project-123',
  mode: 'fast',
  model: 'claude-sonnet-4',
  prompt: 'Add a new feature to handle user authentication',
  userId: 'user-456',
});

for await (const event of agent.run(prompt)) {
  switch (event.type) {
    case 'text_delta':
      process.stdout.write(event.text);
      break;

    case 'tool_start':
      console.log(`\n[Tool] ${event.name}...`);
      break;

    case 'tool_complete':
      console.log(`[Tool] ${event.name} ✓`);
      break;

    case 'complete':
      console.log(`\n✓ Complete! Created ${event.filesCreated.length} files`);
      break;
  }
}
```

## Safety & Loop Protection

1. **Max iterations**: 50 iterations max to prevent infinite loops
2. **Consecutive tool limit**: Detects if same tool called 5+ times in a row
3. **Timeout**: Each tool has 60s timeout
4. **Error recovery**: Tool errors are fed back to AI to allow recovery

## Missing Dependencies

To fully enable the system, install:

```bash
npm install groq-sdk  # For Groq LLM support
```

## Future Enhancements

1. **Web search**: Integrate Google Custom Search or Bing API
2. **Code analysis**: Add tools for AST parsing, symbol lookup
3. **Testing**: Tools to run tests and parse results
4. **Git operations**: Commit, push, pull, branch
5. **Database**: Query and modify databases
6. **API calls**: Make HTTP requests to external services
7. **Multi-file edits**: Batch edit multiple files atomically
8. **Rollback**: Undo changes if tests fail

## Notes

- The system uses **prompt caching** (Anthropic) to reduce costs for repeated system prompts
- Tools are **idempotent** where possible (e.g., write_file can be called multiple times)
- The agent tracks **file changes** to provide a summary of what was modified
- **Token usage** is tracked across all iterations
- The loop can **pause and resume** for user input (ask_user_question tool)
