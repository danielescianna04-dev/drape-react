import { aiProviderService, ChatMessage, ContentBlock, ToolDefinition } from './ai-provider.service';
import { agentToolsService } from './agent-tools.service';
import { fileService } from './file.service';
import { workspaceService } from './workspace.service';
import { sessionService } from './session.service';
import { metricsService } from './metrics.service';
import { getToolDefinitions } from '../tools';
import { log } from '../utils/logger';
import { AgentEvent, AgentMode, AgentOptions, Session, ToolResult } from '../types';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Load the universal system prompt from file
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'claude-code-system-prompt.txt');
const BASE_SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');

const MAX_ITERATIONS = 50;
const TOOL_TIMEOUT = 60000;

// USD to EUR conversion
const USD_TO_EUR = 0.92;

// AI Model Pricing (USD per 1M tokens)
const AI_PRICING: Record<string, { input: number; output: number; cachedInput: number }> = {
  'gemini-3-flash':          { input: 0.50,  output: 3.00,  cachedInput: 0.125 },
  'gemini-3-pro':            { input: 1.25,  output: 10.00, cachedInput: 0.3125 },
  'claude-sonnet-4':         { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-4-5-sonnet':       { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-3.5-sonnet':       { input: 3.00,  output: 15.00, cachedInput: 0.30 },
  'claude-4-5-opus':         { input: 15.00, output: 75.00, cachedInput: 1.50 },
  'claude-3.5-haiku':        { input: 0.80,  output: 4.00,  cachedInput: 0.08 },
  'llama-3.3-70b':           { input: 0.59,  output: 0.79,  cachedInput: 0.15 },
  'llama-3.1-8b':            { input: 0.05,  output: 0.08,  cachedInput: 0.01 },
};

function calculateCostEur(model: string, inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const pricing = AI_PRICING[model] || AI_PRICING['gemini-3-flash'];
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
  const costUsd = (nonCachedInput * pricing.input + cachedTokens * pricing.cachedInput + outputTokens * pricing.output) / 1_000_000;
  return costUsd * USD_TO_EUR;
}

/**
 * ReAct-style agent loop
 * Implements the core agent reasoning loop with tool use
 */
export class AgentLoop {
  private projectId: string;
  private mode: AgentMode;
  private model: string;
  private thinkingLevel: string | null;
  private conversationHistory: ChatMessage[];
  private userId: string | null;
  private userPlan: string;
  private filesCreated: string[] = [];
  private filesModified: string[] = [];
  private session: Session | null = null;
  private totalTokensUsed: { input: number; output: number } = { input: 0, output: 0 };
  private totalCostEur: number = 0;
  private iterationCount: number = 0;

  // Budget limits per plan (monthly EUR)
  private static readonly PLAN_BUDGETS: Record<string, number> = {
    free: 2.00,
    go: 7.50,
    pro: 50.00,
    team: 200.00,
  };

  constructor(options: AgentOptions) {
    this.projectId = options.projectId;
    this.mode = options.mode || 'fast';
    this.model = options.model || 'claude-sonnet-4';
    // For 'fast' mode, use minimal thinking by default for speed
    this.thinkingLevel = options.thinkingLevel || (this.mode === 'fast' ? 'minimal' : null);
    this.userId = options.userId || null;
    this.userPlan = options.userPlan || 'free';
    this.conversationHistory = options.conversationHistory || [];
  }

  /**
   * Check if user has exceeded their AI budget
   */
  private checkBudget(): { exceeded: boolean; percentUsed: number } {
    if (!this.userId) return { exceeded: false, percentUsed: 0 };

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const usage = metricsService.getAIUsageSummary(this.userId, monthStart.getTime());
    const budget = AgentLoop.PLAN_BUDGETS[this.userPlan] || AgentLoop.PLAN_BUDGETS.free;
    const percentUsed = budget > 0 ? Math.round((usage.totalCostEur / budget) * 100) : 0;

    return {
      exceeded: usage.totalCostEur >= budget,
      percentUsed,
    };
  }

  /**
   * Execute a single tool (used by /execute-tool endpoint)
   */
  async executeTool(toolName: string, input: any): Promise<{ success: boolean; result: string }> {
    if (!this.session) {
      this.session = await workspaceService.getOrCreateContainer(this.projectId, this.userId || 'anonymous');
    }
    const result = await agentToolsService.executeTool(toolName, input, this.projectId, this.session);
    return { success: result.success, result: result.content || result.error || '' };
  }

  /**
   * Main agent loop - streams events as it runs
   * @param prompt - User's prompt/request
   * @param images - Optional array of images (base64 encoded)
   */
  async *run(
    prompt: string,
    images?: Array<{ base64: string; type: string }>
  ): AsyncGenerator<AgentEvent> {
    try {
      // 1. Yield start event
      yield {
        type: 'start',
        mode: this.mode,
        projectId: this.projectId,
        model: this.model,
      };

      // 2. Check AI budget before doing anything expensive
      const budgetCheck = this.checkBudget();
      log.info(`[AgentLoop] Budget check: userId=${this.userId}, plan=${this.userPlan}, exceeded=${budgetCheck.exceeded}, percentUsed=${budgetCheck.percentUsed}%`);
      if (budgetCheck.exceeded) {
        log.warn(`[AgentLoop] Budget exceeded for user ${this.userId} (plan: ${this.userPlan}, ${budgetCheck.percentUsed}% used)`);
        yield {
          type: 'budget_exceeded',
          message: 'Hai esaurito il budget AI per questo mese.',
          percentUsed: budgetCheck.percentUsed,
          plan: this.userPlan,
        };
        return;
      }

      // 3. Ensure container exists and is ready
      log.info(`[AgentLoop] Starting agent for project ${this.projectId} with model ${this.model}`);
      this.session = await workspaceService.getOrCreateContainer(this.projectId, this.userId || 'anonymous');

      // 3. Build system prompt with project context + user language
      const systemPrompt = await this.buildSystemPrompt(prompt);

      // 4. Add user message to conversation
      const userMessage = this.buildUserMessage(prompt, images);
      this.conversationHistory.push(userMessage);

      // 5. Main reasoning loop
      let shouldContinue = true;
      let consecutiveSameToolCount = 0;
      let lastToolSignature = ''; // Track tool name + key input to detect actual loops

      while (shouldContinue && this.iterationCount < MAX_ITERATIONS) {
        this.iterationCount++;

        // Re-check budget mid-run to prevent runaway costs
        if (this.iterationCount > 1) {
          const midRunBudgetCheck = this.checkBudget();
          if (midRunBudgetCheck.exceeded) {
            log.warn(`[AgentLoop] Budget exceeded mid-run for user ${this.userId} (plan: ${this.userPlan}, ${midRunBudgetCheck.percentUsed}% used)`);
            yield {
              type: 'budget_exceeded',
              message: 'Hai esaurito il budget AI per questo mese.',
              percentUsed: midRunBudgetCheck.percentUsed,
              plan: this.userPlan,
            };
            break;
          }
        }

        yield {
          type: 'iteration_start',
          iteration: this.iterationCount,
          maxIterations: MAX_ITERATIONS,
        };

        // Call AI model with streaming
        let fullText = '';
        let toolCalls: Array<{ id: string; name: string; input: any; thoughtSignature?: string }> = [];
        let stopReason = '';

        // In planning mode, buffer tool events until we know they're read-only
        const readOnlyTools = ['read_file', 'list_directory', 'glob_search', 'grep_search'];
        const bufferedToolEvents: AgentEvent[] = [];

        // Models with native thinking support - no need to simulate
        // Claude Opus/Sonnet-4 and Gemini 3 have native thinking
        const hasNativeThinking =
          (this.model.toLowerCase().includes('claude') && (this.model.includes('opus') || this.model.includes('sonnet-4'))) ||
          this.model.includes('gemini-3');

        log.info(`[AgentLoop] Model: ${this.model}, hasNativeThinking: ${hasNativeThinking}`);

        try {
          const tools = getToolDefinitions();

          for await (const chunk of aiProviderService.chatStream(
            this.model,
            this.conversationHistory,
            tools,
            systemPrompt,
            { temperature: 0.7, thinkingLevel: this.thinkingLevel }
          )) {
            switch (chunk.type) {
              case 'thinking_start':
                yield { type: 'thinking', text: '', start: true };
                break;

              case 'thinking':
                yield { type: 'thinking', text: chunk.text };
                break;

              case 'thinking_end':
                yield { type: 'thinking', text: '', end: true };
                break;

              case 'text':
                fullText += chunk.text;
                yield { type: 'text_delta', text: chunk.text };
                break;

              case 'tool_start':
                // In planning mode, buffer tool events; otherwise yield immediately
                if (this.mode === 'plan') {
                  bufferedToolEvents.push({
                    type: 'tool_start' as const,
                    id: chunk.id,
                    tool: chunk.name,
                  });
                } else {
                  yield {
                    type: 'tool_start',
                    id: chunk.id,
                    tool: chunk.name,
                  };
                }
                break;

              case 'tool_use':
                toolCalls.push({
                  id: chunk.id,
                  name: chunk.name,
                  input: chunk.input,
                });
                // In planning mode, buffer tool events; otherwise yield immediately
                if (this.mode === 'plan') {
                  bufferedToolEvents.push({
                    type: 'tool_input' as const,
                    id: chunk.id,
                    tool: chunk.name,
                    input: chunk.input,
                  });
                } else {
                  yield {
                    type: 'tool_input',
                    id: chunk.id,
                    tool: chunk.name,
                    input: chunk.input,
                  };
                }
                break;

              case 'done':
                fullText = chunk.fullText;
                toolCalls = chunk.toolCalls;
                stopReason = chunk.stopReason;
                this.totalTokensUsed.input += chunk.usage.inputTokens;
                this.totalTokensUsed.output += chunk.usage.outputTokens;

                // Track AI usage for budget monitoring
                {
                  const cachedTokens = (chunk.usage.cacheReadTokens || 0);
                  const iterationCostEur = calculateCostEur(
                    this.model,
                    chunk.usage.inputTokens,
                    chunk.usage.outputTokens,
                    cachedTokens
                  );
                  this.totalCostEur += iterationCostEur;

                  metricsService.trackAIUsage({
                    userId: this.userId || 'anonymous',
                    model: this.model,
                    inputTokens: chunk.usage.inputTokens,
                    outputTokens: chunk.usage.outputTokens,
                    cachedTokens,
                    costEur: iterationCostEur,
                  });

                  // Emit usage event for real-time cost tracking
                  yield {
                    type: 'usage',
                    inputTokens: chunk.usage.inputTokens,
                    outputTokens: chunk.usage.outputTokens,
                    cachedTokens,
                    iterationCostEur,
                    totalCostEur: this.totalCostEur,
                    totalInputTokens: this.totalTokensUsed.input,
                    totalOutputTokens: this.totalTokensUsed.output,
                  };
                }
                break;
            }
          }
        } catch (error: any) {
          log.error(`[AgentLoop] AI streaming error: ${error.message}`);
          // Extract clean error message for the user
          let userMessage = error.message || 'Unknown error';
          // Parse nested JSON error messages (e.g. Gemini 503)
          try {
            const match = userMessage.match(/"message"\s*:\s*"([^"]+)"/);
            if (match) userMessage = match[1];
          } catch {}
          if (userMessage.includes('overload')) {
            userMessage = 'Il modello AI è temporaneamente sovraccarico. Riprova tra qualche secondo.';
          } else if (userMessage.includes('rate limit') || userMessage.includes('429')) {
            userMessage = 'Troppi messaggi. Attendi qualche secondo e riprova.';
          } else if (userMessage.includes('timeout') || userMessage.includes('ETIMEDOUT')) {
            userMessage = 'Timeout nella risposta AI. Riprova.';
          }
          yield {
            type: 'error',
            error: userMessage,
          };
          return;
        }

        // In planning mode: check if all tools are read-only before yielding buffered events
        if (this.mode === 'plan' && bufferedToolEvents.length > 0) {
          const hasWriteTools = toolCalls.some(tc => !readOnlyTools.includes(tc.name));
          if (!hasWriteTools) {
            // Only read-only tools - yield the buffered events
            for (const event of bufferedToolEvents) {
              yield event;
            }
          }
          // If hasWriteTools, don't yield the events - plan_ready will be emitted below
        }

        // Add assistant message to history
        const assistantContent: ContentBlock[] = [];

        if (fullText) {
          assistantContent.push({ type: 'text', text: fullText });
        }

        if (toolCalls.length > 0) {
          for (const tool of toolCalls) {
            const toolUseBlock: any = {
              type: 'tool_use',
              id: tool.id,
              name: tool.name,
              input: tool.input,
            };
            // Include thoughtSignature for Gemini 3
            if (tool.thoughtSignature) {
              toolUseBlock.thoughtSignature = tool.thoughtSignature;
            }
            assistantContent.push(toolUseBlock);
          }
        }

        if (assistantContent.length > 0) {
          this.conversationHistory.push({
            role: 'assistant',
            content: assistantContent,
          });
        }

        // PLANNING MODE: Don't execute write tools, gather context then generate plan
        if (this.mode === 'plan') {
          const hasWriteTools = toolCalls.some(tc => !readOnlyTools.includes(tc.name));

          // If AI tries to use write tools, stop and emit the plan
          if (hasWriteTools) {
            log.info(`[AgentLoop] Planning mode - write tools requested, emitting plan`);
            const plan = this.extractPlanFromResponse(fullText, toolCalls);

            yield {
              type: 'plan_ready',
              plan,
              planContent: fullText,
              filesCreated: [],
              filesModified: [],
            };
            return;
          }

          // If AI has NO tool calls (just text), the plan is ready
          if (toolCalls.length === 0 && fullText) {
            log.info(`[AgentLoop] Planning mode - no more tools, plan is ready`);
            const plan = this.extractPlanFromResponse(fullText, toolCalls);

            yield {
              type: 'plan_ready',
              plan,
              planContent: fullText,
              filesCreated: [],
              filesModified: [],
            };
            return;
          }

          // Handle empty responses from Gemini - if no text AND no tool calls, emit plan with accumulated context
          if (toolCalls.length === 0 && !fullText) {
            log.warn(`[AgentLoop] Planning mode - empty response from model (likely Gemini), emitting plan with accumulated context`);

            // Try to extract plan from conversation history
            let accumulatedPlanText = '';
            for (const msg of this.conversationHistory) {
              if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                for (const block of msg.content) {
                  if (block.type === 'text' && block.text) {
                    accumulatedPlanText += block.text + '\n';
                  }
                }
              } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
                accumulatedPlanText += msg.content + '\n';
              }
            }

            const plan = this.extractPlanFromResponse(accumulatedPlanText || 'Plan generation incomplete - please try again', toolCalls);

            yield {
              type: 'plan_ready',
              plan,
              planContent: accumulatedPlanText || 'Plan generation incomplete',
              filesCreated: [],
              filesModified: [],
            };
            return;
          }

          // Safety limit: max 5 iterations of context gathering
          if (this.iterationCount >= 5) {
            log.info(`[AgentLoop] Planning mode - max iterations reached, emitting plan`);
            const plan = this.extractPlanFromResponse(fullText, toolCalls);

            yield {
              type: 'plan_ready',
              plan,
              planContent: fullText,
              filesCreated: [],
              filesModified: [],
            };
            return;
          }

          // Continue with read-only tools for context gathering
          if (toolCalls.length > 0) {
            log.info(`[AgentLoop] Planning mode - executing ${toolCalls.length} read-only tools for context`);
          }
        }

        // Handle tool calls
        if (toolCalls.length > 0) {
          // Check for infinite loops (same tool called with same params repeatedly)
          const currentTool = toolCalls[0];
          const currentToolName = currentTool.name;

          // Build a signature that includes key input params to avoid false positives
          // Include file_path for file operations - operating on different files is NOT a loop
          // For edit_file, include old_string hash to distinguish different edits to same file
          let toolSignature = currentToolName;
          if (currentToolName === 'read_file' && currentTool.input?.file_path) {
            toolSignature = `${currentToolName}:${currentTool.input.file_path}`;
          } else if (currentToolName === 'edit_file' && currentTool.input) {
            const oldStringHash = currentTool.input.old_string
              ? currentTool.input.old_string.substring(0, 50).replace(/\s+/g, '')
              : '';
            toolSignature = `${currentToolName}:${currentTool.input.file_path}:${oldStringHash}`;
          } else if (currentToolName === 'write_file' && currentTool.input?.file_path) {
            toolSignature = `${currentToolName}:${currentTool.input.file_path}`;
          } else if (currentToolName === 'glob_files' && currentTool.input?.pattern) {
            toolSignature = `${currentToolName}:${currentTool.input.pattern}`;
          } else if (currentToolName === 'search_files' && currentTool.input?.pattern) {
            toolSignature = `${currentToolName}:${currentTool.input.pattern}`;
          } else if ((currentToolName === 'run_command' || currentToolName === 'execute_command') && currentTool.input?.command) {
            // Include the command itself — different commands are NOT a loop
            toolSignature = `${currentToolName}:${currentTool.input.command.substring(0, 80)}`;
          }

          if (toolSignature === lastToolSignature) {
            consecutiveSameToolCount++;
            if (consecutiveSameToolCount >= 5) {
              log.warn(`[AgentLoop] Detected potential infinite loop with tool: ${toolSignature}`);
              yield {
                type: 'error',
                error: `Agent appears stuck in a loop calling ${currentToolName}. Stopping.`,
              };
              return;
            }
          } else {
            consecutiveSameToolCount = 0;
          }
          lastToolSignature = toolSignature;

          // Execute each tool
          const toolResults: ContentBlock[] = [];

          for (const toolCall of toolCalls) {
            try {
              const result = await agentToolsService.executeTool(
                toolCall.name,
                toolCall.input,
                this.projectId,
                this.session || undefined
              );

              // Handle special tool results
              if ((result as any)._pauseForUser) {
                // ask_user_question tool
                yield {
                  type: 'ask_user_question',
                  questions: (result as any).questions,
                };
                // Pause the loop - it will resume when user provides answers
                return;
              }

              if ((result as any)._completion) {
                // signal_completion tool
                yield {
                  type: 'complete',
                  result: result.content || 'Task completed',
                  filesCreated: this.filesCreated,
                  filesModified: this.filesModified,
                  tokensUsed: this.totalTokensUsed,
                  costEur: this.totalCostEur,
                  iterations: this.iterationCount,
                };
                return;
              }

              // Handle todo updates
              if (toolCall.name === 'todo_write' && (result as any).todos) {
                yield {
                  type: 'todo_update',
                  todos: (result as any).todos,
                };
              }

              // Track file operations
              if (toolCall.name === 'write_file') {
                const filePath = toolCall.input.file_path;
                if (this.filesCreated.includes(filePath)) {
                  if (!this.filesModified.includes(filePath)) {
                    this.filesModified.push(filePath);
                  }
                } else {
                  this.filesCreated.push(filePath);
                }
              } else if (toolCall.name === 'edit_file') {
                const filePath = toolCall.input.file_path;
                if (!this.filesModified.includes(filePath)) {
                  this.filesModified.push(filePath);
                }
              }

              // Yield tool completion
              yield {
                type: 'tool_complete',
                id: toolCall.id,
                tool: toolCall.name,
                result: result.content || JSON.stringify(result),
                success: result.success,
                input: toolCall.input,
              };

              // Add tool result to conversation (include thoughtSignature for Gemini 3)
              const toolResultBlock: any = {
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: result.content || JSON.stringify(result),
              };
              if (toolCall.thoughtSignature) {
                toolResultBlock.thoughtSignature = toolCall.thoughtSignature;
              }
              toolResults.push(toolResultBlock);
            } catch (error: any) {
              log.error(`[AgentLoop] Tool ${toolCall.name} error: ${error.message}`);
              yield {
                type: 'tool_error',
                id: toolCall.id,
                tool: toolCall.name,
                error: error.message,
              };

              // Add error result to conversation (include thoughtSignature for Gemini 3)
              const errorResultBlock: any = {
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: `Error: ${error.message}`,
              };
              if (toolCall.thoughtSignature) {
                errorResultBlock.thoughtSignature = toolCall.thoughtSignature;
              }
              toolResults.push(errorResultBlock);
            }
          }

          // Add tool results as user message
          if (toolResults.length > 0) {
            this.conversationHistory.push({
              role: 'user',
              content: toolResults,
            });
          }

          // Continue loop to get next agent response
          shouldContinue = true;
        } else {
          // No tool calls - agent is done
          shouldContinue = false;

          // Generate summary if model didn't provide final text
          let finalResult = fullText;
          if (!finalResult || finalResult.trim().length === 0) {
            const changes: string[] = [];
            if (this.filesCreated.length > 0) {
              changes.push(`File creati: ${this.filesCreated.join(', ')}`);
            }
            if (this.filesModified.length > 0) {
              changes.push(`File modificati: ${this.filesModified.join(', ')}`);
            }
            finalResult = changes.length > 0
              ? `Task completato.\n\n${changes.join('\n')}`
              : 'Task completato.';
          }

          yield {
            type: 'complete',
            result: finalResult,
            filesCreated: this.filesCreated,
            filesModified: this.filesModified,
            tokensUsed: this.totalTokensUsed,
            costEur: this.totalCostEur,
            iterations: this.iterationCount,
          };
        }

        // Check iteration limit
        if (this.iterationCount >= MAX_ITERATIONS) {
          yield {
            type: 'budget_exceeded',
            message: `Maximum iterations (${MAX_ITERATIONS}) reached`,
            iterations: this.iterationCount,
          };
          return;
        }
      }
    } catch (error: any) {
      log.error(`[AgentLoop] Fatal error: ${error.message}`);
      yield {
        type: 'fatal_error',
        error: error.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
      };
    }
  }

  /**
   * Build system prompt with project context
   */
  private async buildSystemPrompt(userPrompt?: string): Promise<string> {
    const basePrompt = this.getBasePromptForMode();

    // Get project file tree
    let projectContext = '';
    try {
      const files = await fileService.listAllFiles(this.projectId);
      if (files.success && files.data && files.data.length > 0) {
        const fileList = files.data
          .slice(0, 200) // Limit to avoid token overflow
          .map(f => f.path)
          .join('\n');

        projectContext = `\n\n## Project Files\n\nThe project contains the following files:\n\`\`\`\n${fileList}\n\`\`\`\n`;

        if (files.data.length > 200) {
          projectContext += `\n(Showing first 200 of ${files.data.length} files)`;
        }
      }
    } catch (error: any) {
      log.warn(`[AgentLoop] Failed to load project files: ${error.message}`);
    }

    // Add session info
    let sessionInfo = '';
    if (this.session) {
      sessionInfo = `\n\n## Environment\n\nYou have access to a container with:\n`;
      sessionInfo += `- Project directory: /home/coder/project\n`;
      sessionInfo += `- Agent URL: ${this.session.agentUrl}\n`;
      if (this.session.projectInfo) {
        sessionInfo += `- Project type: ${this.session.projectInfo.type}\n`;
        sessionInfo += `- Package manager: ${this.session.projectInfo.packageManager || 'npm'}\n`;
      }
    }

    // Detect user language and add explicit directive
    let languageDirective = '';
    if (userPrompt) {
      // Simple heuristic: check for common Italian/Spanish/French/German words
      const lowerPrompt = userPrompt.toLowerCase();
      const italianMarkers = ['fammi', 'crea', 'aggiungi', 'modifica', 'scrivi', 'fai', 'voglio', 'vorrei', 'puoi', 'come', 'cosa', 'perché', 'anche', 'questo', 'quello', 'sono', 'della', 'delle', 'nella', 'pagina', 'sito', 'nuovo', 'nuova', 'eventi', 'con', 'per', 'una', 'che', 'gli', 'dai', 'alla'];
      const italianCount = italianMarkers.filter(w => lowerPrompt.includes(w)).length;
      if (italianCount >= 2) {
        languageDirective = `\n\n## LANGUAGE: ITALIAN\nThe user is writing in Italian. You MUST respond ENTIRELY in Italian. Every text output, todo item, explanation, and completion message MUST be in Italian. Do NOT use English.\n`;
      }
    }

    return basePrompt + languageDirective + projectContext + sessionInfo;
  }

  /**
   * Get base prompt based on agent mode
   * Uses the universal system prompt from claude-code-system-prompt.txt for ALL models
   */
  private getBasePromptForMode(): string {
    // Use the same prompt for ALL models (Claude, Gemini, etc.)
    let prompt = BASE_SYSTEM_PROMPT;

    // Add mode-specific instructions
    switch (this.mode) {
      case 'fast':
        prompt += `

## Mode: Fast

You are in FAST mode. Prioritize speed and efficiency:
- Get to the solution quickly
- Don't overthink - make reasonable assumptions
- **MINIMIZE TOOL CALLS** - Use write_file to rewrite entire files instead of multiple edit_file calls
- Complete the task in as few iterations as possible
- When done, call signal_completion with a summary

CRITICAL LANGUAGE RULE: You MUST reply in the EXACT same language the user wrote their message in. If the user writes in Italian, ALL your text output (explanations, comments in code, todo items, completion messages) MUST be in Italian. If English, reply in English. NEVER switch language mid-conversation.
`;
        break;

      case 'plan':
        prompt += `

## Mode: Plan

You are in PLANNING mode. Your goal is to create a detailed execution plan WITHOUT making any changes.

### Instructions:
1. First, use read-only tools (read_file, list_directory, glob_search, grep_search) to understand the codebase
2. Analyze the user's request thoroughly
3. Create a numbered plan with specific, actionable steps

### Important:
- DO NOT execute any write operations (edit_file, write_file, run_command)
- DO NOT make any actual changes to files
- ONLY analyze and create the plan

CRITICAL LANGUAGE RULE: You MUST reply in the EXACT same language the user wrote their message in. If the user writes in Italian, ALL your text output (plan steps, descriptions, todo items) MUST be in Italian. NEVER switch language.
`;
        break;

      case 'execute':
        prompt += `

## Mode: Execute

You are in EXECUTE mode. Follow plans carefully:
- Execute each step methodically
- Update the todo list as you progress
- Handle errors gracefully
- When done, call signal_completion with a summary

CRITICAL LANGUAGE RULE: You MUST reply in the EXACT same language the user wrote their message in. If the user writes in Italian, ALL your text output MUST be in Italian. NEVER switch language.
`;
        break;
    }

    return prompt;
  }

  /**
   * Extract a structured plan from the AI's response
   */
  private extractPlanFromResponse(text: string, toolCalls: Array<{ id: string; name: string; input: any; thoughtSignature?: string }>): {
    id: string;
    steps: Array<{ id: string; description: string; tool?: string; status: 'pending' }>;
    summary: string;
  } {
    const steps: Array<{ id: string; description: string; tool?: string; status: 'pending' }> = [];

    // Try to extract numbered steps from the text
    // Match patterns like "1. **Title**: Description" or "1. Title: Description" or "- Step description"
    const stepPatterns = [
      /^\d+\.\s*\*\*([^*]+)\*\*:?\s*(.*)$/gm,  // 1. **Title**: Description
      /^\d+\.\s*([^:]+):\s*(.*)$/gm,           // 1. Title: Description
      /^[-•]\s*\*\*([^*]+)\*\*:?\s*(.*)$/gm,   // - **Title**: Description
      /^[-•]\s*(.+)$/gm,                        // - Step description
    ];

    let matched = false;

    for (const pattern of stepPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        matched = true;
        const title = match[1]?.trim() || '';
        const description = match[2]?.trim() || match[1]?.trim() || '';

        steps.push({
          id: `step-${steps.length + 1}`,
          description: title && description !== title ? `${title}: ${description}` : description,
          status: 'pending',
        });
      }
      if (matched) break;
    }

    // If no steps were extracted, create a single step from the full text
    if (steps.length === 0) {
      // Split by newlines and filter meaningful lines
      const lines = text.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 10 && !trimmed.startsWith('#') && !trimmed.startsWith('```');
      });

      if (lines.length > 0) {
        lines.slice(0, 10).forEach((line, idx) => {
          steps.push({
            id: `step-${idx + 1}`,
            description: line.trim(),
            status: 'pending',
          });
        });
      } else {
        steps.push({
          id: 'step-1',
          description: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
          status: 'pending',
        });
      }
    }

    // Generate summary
    const summary = steps.length > 0
      ? `Piano con ${steps.length} passaggi`
      : 'Piano generato';

    return {
      id: `plan-${Date.now()}`,
      steps,
      summary,
    };
  }

  /**
   * Build user message with optional images
   */
  private buildUserMessage(
    prompt: string,
    images?: Array<{ base64: string; type: string }>
  ): ChatMessage {
    if (!images || images.length === 0) {
      return {
        role: 'user',
        content: prompt,
      };
    }

    // Multimodal message with images
    const content: ContentBlock[] = [
      { type: 'text', text: prompt },
    ];

    for (const img of images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.type || 'image/jpeg',
          data: img.base64,
        },
      });
    }

    return {
      role: 'user',
      content,
    };
  }

  /**
   * Get conversation history (for resuming)
   */
  getConversationHistory(): ChatMessage[] {
    return this.conversationHistory;
  }

  /**
   * Get files created/modified (for summary)
   */
  getFileChanges(): { created: string[]; modified: string[] } {
    return {
      created: this.filesCreated,
      modified: this.filesModified,
    };
  }

  /**
   * Get token usage
   */
  getTokenUsage(): { input: number; output: number } {
    return this.totalTokensUsed;
  }

  /**
   * Resume loop after user answers questions
   * This allows the agent to pause and wait for user input
   */
  async *resume(userAnswers: string): AsyncGenerator<AgentEvent> {
    // Add user's answers to conversation
    this.conversationHistory.push({
      role: 'user',
      content: userAnswers,
    });

    // Continue the loop
    yield* this.run('', []);
  }
}
