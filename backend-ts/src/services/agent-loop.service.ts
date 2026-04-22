import { ChatMessage, ContentBlock, ToolDefinition } from './ai-provider.service';
import { vercelChatStream, vercelChatSimple, getContextWindowTokens as vercelGetContextWindowTokens } from './ai-providers';
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
import { config, planAiBudgets } from '../config';
import { runPreHooks, runPostHooks } from './hooks.service';
import { saveConversation } from './conversation-store';
import { initMcpServers, getAllMcpTools, callMcpTool, disconnectAllMcp } from './mcp-client';
import { conversationOptimizerService } from './conversation-optimizer.service';
import { calculateAICostEur } from './ai-pricing.service';

// Load the universal system prompt from file
const SYSTEM_PROMPT_PATH = path.join(__dirname, 'claude-code-system-prompt.txt');
const BASE_SYSTEM_PROMPT = fs.readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');

const MAX_ITERATIONS = 50;
const TOOL_TIMEOUT = 60000;

type PreviewContext = {
  source?: 'preview';
  mode?: 'selected-element' | 'selected-element-question' | 'follow-up' | 'general-edit';
  language?: 'it' | 'en';
  currentRequest?: string;
  shouldPreferExecution?: boolean;
  elementSummary?: string;
  previousRequest?: string;
} | null;

/**
 * ReAct-style agent loop
 * Implements the core agent reasoning loop with tool use
 */
export class AgentLoop {
  private projectId: string;
  private mode: AgentMode;
  private model: string;
  private thinkingLevel: string | null;
  private taskBudgetTokens: number | null;
  private systemPromptOverride: string | null;
  private conversationHistory: ChatMessage[];
  private userId: string | null;
  private userPlan: string;
  private usagePhase: AgentOptions['usagePhase'];
  private executionPlan: any | null;
  private previewContext: PreviewContext = null;
  private filesCreated: string[] = [];
  private filesModified: string[] = [];
  private session: Session | null = null;
  private totalTokensUsed: { input: number; output: number } = { input: 0, output: 0 };
  private totalCostEur: number = 0;
  private iterationCount: number = 0;
  private originalPrompt: string = '';
  private latestTodos: Array<{ status?: string }> = [];
  private cachedTokenEstimate: number = 0; // Incremental token tracking

  // Sub-agent support
  public toolFilter: 'all' | 'read_only' | 'no_subagent' = 'all';
  public maxIterations: number = MAX_ITERATIONS;

  // File watcher: external changes to inject into conversation
  private pendingFileChanges: Array<{ type: string; path: string }> = [];

  /** Notify the agent loop of external file changes (from file watcher). */
  public notifyFileChange(type: string, filePath: string) {
    this.pendingFileChanges.push({ type, path: filePath });
  }

  constructor(options: AgentOptions) {
    this.projectId = options.projectId;
    this.mode = options.mode || 'fast';
    this.model = options.model || 'gemini-3-flash';
    this.systemPromptOverride = options.systemPromptOverride || null;
    const isClaude = (options.model || 'gemini-3-flash').startsWith('claude');
    if (options.thinkingLevel) {
      this.thinkingLevel = options.thinkingLevel;
    } else if (this.mode === 'fast' && !isClaude) {
      this.thinkingLevel = 'minimal';
    } else {
      this.thinkingLevel = null;
    }
    this.taskBudgetTokens = typeof options.taskBudgetTokens === 'number' ? options.taskBudgetTokens : null;
    this.userId = options.userId || null;
    this.userPlan = options.userPlan || 'free';
    this.usagePhase = options.usagePhase;
    this.executionPlan = options.executionPlan || null;
    this.previewContext = options.previewContext || null;
    this.conversationHistory = this.sanitizeConversationHistory(options.conversationHistory || []);
  }

  /**
   * Remove invalid/empty history entries before sending them to the model.
   * This prevents provider validation errors like "text content blocks must be non-empty".
   */
  private sanitizeConversationHistory(history: ChatMessage[]): ChatMessage[] {
    if (!Array.isArray(history)) return [];

    const sanitized: ChatMessage[] = [];

    for (const msg of history) {
      if (!msg || (msg.role !== 'user' && msg.role !== 'assistant' && msg.role !== 'system')) {
        continue;
      }

      if (Array.isArray(msg.content)) {
        const blocks: ContentBlock[] = [];

        for (const block of msg.content) {
          if (block.type === 'text') {
            if (typeof block.text === 'string' && block.text.trim().length > 0) {
              blocks.push({ type: 'text', text: block.text });
            }
          } else if (block.type === 'image') {
            if (block.source.type === 'base64' && block.source.data) {
              blocks.push(block);
            } else if (block.source.type === 'url' && block.source.url) {
              blocks.push(block);
            }
          } else if (block.type === 'tool_use') {
            if (block.id && block.name) {
              blocks.push(block);
            }
          } else if (block.type === 'tool_result') {
            if (block.tool_use_id) {
              blocks.push({
                ...block,
                content: (typeof block.content === 'string' && block.content.trim().length > 0)
                  ? block.content
                  : '(no output)',
              });
            }
          }
        }

        if (blocks.length > 0) {
          sanitized.push({ role: msg.role, content: blocks });
        }
      } else {
        const text = String(msg.content ?? '');
        if (text.trim().length > 0) {
          sanitized.push({ role: msg.role, content: text });
        }
      }
    }

    return sanitized;
  }

  private messageTextContent(message: ChatMessage): string {
    if (!message?.content) return '';
    if (typeof message.content === 'string') return message.content;
    return message.content
      .filter((block): block is Extract<ContentBlock, { type: 'text' | 'tool_result' }> =>
        block.type === 'text' || block.type === 'tool_result'
      )
      .map((block) => (block.type === 'text' ? block.text : block.content))
      .join('\n');
  }

  private historyContainsText(pattern: string): boolean {
    return this.conversationHistory.some((msg) => this.messageTextContent(msg).includes(pattern));
  }

  private buildPreviewContextDirective(): string {
    if (!this.previewContext || this.previewContext.source !== 'preview') {
      return '';
    }

    const language = this.previewContext.language === 'it' ? 'it' : 'en';
    const replyRule = language === 'it'
      ? 'Reply entirely in Italian.'
      : 'Reply entirely in English.';
    const lines = language === 'it'
      ? [
          '## Preview Context',
          'L’utente sta scrivendo dalla live preview del progetto.',
          this.previewContext.elementSummary ? `Elemento/target corrente: ${this.previewContext.elementSummary}` : 'Il target è l’interfaccia attualmente visibile in preview.',
          this.previewContext.previousRequest ? `Richiesta precedente rilevante: ${this.previewContext.previousRequest}` : '',
          `Richiesta attuale: ${this.previewContext.currentRequest || ''}`,
          this.previewContext.shouldPreferExecution
            ? 'Questa è una richiesta operativa sulla UI. Se la modifica è concreta, usa i tool e cambia davvero il codice invece di fermarti a descrivere il piano.'
            : 'Usa questo contesto per rispondere rispetto all’elemento o alla preview corrente.',
          replyRule,
        ]
      : [
          '## Preview Context',
          'The user is chatting from the live project preview.',
          this.previewContext.elementSummary ? `Current element/target: ${this.previewContext.elementSummary}` : 'The target is the currently visible UI in the preview.',
          this.previewContext.previousRequest ? `Relevant previous request: ${this.previewContext.previousRequest}` : '',
          `Current request: ${this.previewContext.currentRequest || ''}`,
          this.previewContext.shouldPreferExecution
            ? 'This is an operational UI request. If the change is concrete, use tools and modify the real code instead of only describing the plan.'
            : 'Use this context to answer about the current element or preview.',
          replyRule,
        ];

    return `\n\n${lines.filter(Boolean).join('\n')}\n`;
  }

  /**
   * Check if user has exceeded their AI budget
   */
  private checkBudget(): { exceeded: boolean; percentUsed: number; spentEur: number; budgetEur: number } {
    if (!this.userId) return { exceeded: false, percentUsed: 0, spentEur: 0, budgetEur: 0 };

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Exclude Drape-absorbed system phases from the user's monthly budget.
    const usage = metricsService.getAIUsageSummary(this.userId, monthStart.getTime(), ['generation', 'verify']);
    const budget = planAiBudgets[this.userPlan as keyof typeof planAiBudgets]?.monthlyBudgetEur
      || planAiBudgets.free.monthlyBudgetEur;
    const percentUsed = budget > 0 ? Math.round((usage.totalCostEur / budget) * 100) : 0;

    return {
      exceeded: budget > 0 && usage.totalCostEur >= budget,
      percentUsed,
      spentEur: usage.totalCostEur,
      budgetEur: budget,
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
    this.originalPrompt = prompt;
    try {
      // 1. Yield start event
      yield {
        type: 'start',
        mode: this.mode,
        projectId: this.projectId,
        model: this.model,
      };

      // 2. Check AI budget before doing anything expensive.
      // Creation and verify phases are Drape-absorbed costs (part of the
      // subscription), not counted against the user's monthly budget.
      const isSystemPhase = this.usagePhase === 'generation' || this.usagePhase === 'verify';
      const budgetCheck = isSystemPhase
        ? { exceeded: false, percentUsed: 0, spentEur: 0, budgetEur: 0 }
        : this.checkBudget();
      log.info(`[AgentLoop] Budget check: userId=${this.userId}, plan=${this.userPlan}, phase=${this.usagePhase}, exceeded=${budgetCheck.exceeded}, percentUsed=${budgetCheck.percentUsed}%, spentEur=${budgetCheck.spentEur}, budgetEur=${budgetCheck.budgetEur}`);
      if (budgetCheck.exceeded) {
        log.warn(`[AgentLoop] Budget exceeded for user ${this.userId} (plan: ${this.userPlan}, spent=€${budgetCheck.spentEur}, budget=€${budgetCheck.budgetEur})`);
        yield {
          type: 'budget_exceeded',
          message: `Budget esaurito: speso €${budgetCheck.spentEur.toFixed(2)} su €${budgetCheck.budgetEur.toFixed(2)} (piano ${this.userPlan}).`,
          percentUsed: budgetCheck.percentUsed,
          plan: this.userPlan,
        };
        return;
      }

      // Emit budget warning at 75% and 90% thresholds
      if (budgetCheck.percentUsed >= 75) {
        const budget = planAiBudgets[this.userPlan as keyof typeof planAiBudgets]?.monthlyBudgetEur
          || planAiBudgets.free.monthlyBudgetEur;
        yield {
          type: 'budget_warning',
          percentUsed: budgetCheck.percentUsed,
          plan: this.userPlan,
          budgetEur: budget,
        };
      }

      // 3. Ensure container exists and is ready
      log.info(`[AgentLoop] Starting agent for project ${this.projectId} with model ${this.model}`);
      this.session = await workspaceService.getOrCreateContainer(this.projectId, this.userId || 'anonymous');

      // 3. Build system prompt with project context + user language
      const systemPrompt = await this.buildSystemPrompt(prompt);

      // 4. Add user message to conversation
      const userMessage = this.buildUserMessage(prompt, images);
      this.pushMessage(userMessage);

      // 5. Main reasoning loop
      let shouldContinue = true;
      let consecutiveSameToolCount = 0;
      let lastToolSignature = ''; // Track tool name + key input to detect actual loops
      const hasPreviewExecutionContext =
        !!this.previewContext?.shouldPreferExecution
        || !!this.previewContext?.mode
        || this.historyContainsText('[PreviewContext:selected-element]')
        || this.historyContainsText('[PreviewContext:follow-up]')
        || this.historyContainsText('[PreviewContext:general-edit]');
      const isPreviewElementExecutionPrompt =
        prompt.includes('L’utente ha selezionato un elemento specifico nella preview e vuole che tu modifichi PROPRIO quello.')
        || prompt.includes('L’utente sta confermando di procedere con una modifica già riferita a un elemento selezionato nella preview.')
        || prompt.includes('L’utente sta inviando un follow-up breve nella preview chat.')
        || hasPreviewExecutionContext;
      let previewExecutionNudgeCount = 0;
      while (shouldContinue && this.iterationCount < this.maxIterations) {
        this.iterationCount++;

        // Inject external file changes into conversation (from file watcher)
        if (this.pendingFileChanges.length > 0) {
          const changes = this.pendingFileChanges.splice(0);
          const changesSummary = changes.map(c => `${c.type}: ${c.path}`).join('\n');
          this.pushMessage({
            role: 'user',
            content: [{ type: 'text', text: `[System] Files changed externally:\n${changesSummary}\nPlease take these changes into account.` }],
          });
        }

        // Re-check budget mid-run every 5 iterations to prevent runaway costs.
        // Skip entirely for system phases (generation/verify).
        if (!isSystemPhase && this.iterationCount > 1 && this.iterationCount % 5 === 0) {
          const midRunBudgetCheck = this.checkBudget();
          if (midRunBudgetCheck.exceeded) {
            log.warn(`[AgentLoop] Budget exceeded mid-run for user ${this.userId} (plan: ${this.userPlan}, spent=€${midRunBudgetCheck.spentEur}, budget=€${midRunBudgetCheck.budgetEur})`);
            yield {
              type: 'budget_exceeded',
              message: `Budget esaurito: speso €${midRunBudgetCheck.spentEur.toFixed(2)} su €${midRunBudgetCheck.budgetEur.toFixed(2)} (piano ${this.userPlan}).`,
              percentUsed: midRunBudgetCheck.percentUsed,
              plan: this.userPlan,
            };
            break;
          }
        }

        yield {
          type: 'iteration_start',
          iteration: this.iterationCount,
          maxIterations: this.maxIterations,
        };

        // Call AI model with streaming
        let fullText = '';
        let toolCalls: Array<{ id: string; name: string; input: any; thoughtSignature?: string }> = [];
        let stopReason = '';

        // In planning mode, buffer tool events until we know they're read-only
        const readOnlyTools = ['read_file', 'list_directory', 'glob_search', 'grep_search'];
        const bufferedToolEvents: AgentEvent[] = [];

        // Streaming tag stripper: buffer text that might contain <system-reminder>...</system-reminder>
        // to prevent Gemini-echoed system tags from reaching the client
        let textBuffer = '';
        const TAG_OPEN = '<system-reminder>';
        const TAG_CLOSE = '</system-reminder>';
        const flushTextBuffer = function* (force = false): Generator<AgentEvent> {
          if (!textBuffer) return;
          if (force) {
            // Force flush everything remaining (end of stream)
            yield { type: 'text_delta', text: textBuffer } as AgentEvent;
            textBuffer = '';
            return;
          }
          // Check for complete tags to strip
          while (textBuffer.includes(TAG_OPEN) && textBuffer.includes(TAG_CLOSE)) {
            const openIdx = textBuffer.indexOf(TAG_OPEN);
            const closeIdx = textBuffer.indexOf(TAG_CLOSE);
            if (closeIdx > openIdx) {
              // Yield text before the tag
              if (openIdx > 0) {
                yield { type: 'text_delta', text: textBuffer.substring(0, openIdx) } as AgentEvent;
              }
              // Strip the tag entirely
              textBuffer = textBuffer.substring(closeIdx + TAG_CLOSE.length);
            } else {
              break;
            }
          }
          // If no partial tag opener, flush safe prefix
          const partialIdx = textBuffer.indexOf('<');
          if (partialIdx === -1) {
            // No angle bracket — safe to flush all
            yield { type: 'text_delta', text: textBuffer } as AgentEvent;
            textBuffer = '';
          } else if (partialIdx > 0) {
            // Flush up to the potential tag start
            yield { type: 'text_delta', text: textBuffer.substring(0, partialIdx) } as AgentEvent;
            textBuffer = textBuffer.substring(partialIdx);
          }
          // else partialIdx === 0: keep buffering until we know if it's a tag
          // Safety: if buffer grows too large without a match, flush it
          if (textBuffer.length > 500) {
            yield { type: 'text_delta', text: textBuffer } as AgentEvent;
            textBuffer = '';
          }
        };

        // Models with native thinking support - no need to simulate
        const hasNativeThinking =
          this.model.toLowerCase().includes('claude') || this.model.includes('gemini-3');

        log.info(`[AgentLoop] Model: ${this.model}, thinkingLevel: ${this.thinkingLevel || 'disabled'}`);

        let modelConversationHistory = this.conversationHistory;
        const optimizerStartedAt = Date.now();

        try {
          const optimized = await conversationOptimizerService.optimizeForModel({
            projectId: this.projectId,
            history: this.conversationHistory,
            model: this.model,
            systemPrompt,
          });

          modelConversationHistory = optimized.optimizedHistory;

          if (optimized.canonicalHistory) {
            this.conversationHistory = optimized.canonicalHistory;
            this.cachedTokenEstimate = conversationOptimizerService.estimateTokenCount(this.conversationHistory, systemPrompt);
          }

          metricsService.trackOperation({
            operation: 'conversation_optimizer_run',
            durationMs: Date.now() - optimizerStartedAt,
            success: true,
            metadata: {
              userId: this.userId || 'anonymous',
              projectId: this.projectId,
              model: this.model,
              originalEstimatedTokens: optimized.report.originalEstimatedTokens,
              optimizedEstimatedTokens: optimized.report.optimizedEstimatedTokens,
              savedTokens: optimized.report.savedTokens,
              digestedToolResults: optimized.report.digestedToolResults,
              digestedTextBlocks: optimized.report.digestedTextBlocks,
              summaryUsed: optimized.report.summaryUsed,
              summaryUpdated: optimized.report.summaryUpdated,
            },
          });
        } catch (optimizerError: any) {
          log.warn(`[AgentLoop] Conversation optimizer failed: ${optimizerError.message}`);
        }

        // Auto-compact conversation if approaching context window limit
        try {
          const needsCompaction = this.shouldCompact(systemPrompt);
          if (needsCompaction) {
            yield { type: 'context_compacting' };
          }
          const compacted = await this.compactConversationHistory(systemPrompt);
          if (compacted) {
            yield {
              type: 'context_compacted',
              message: `Contesto compattato automaticamente (${this.conversationHistory.length} messaggi rimanenti)`,
            };
          }
        } catch (compactError: any) {
          log.warn(`[AgentLoop] Compaction check failed: ${compactError.message}`);
        }

        try {
          const tools = await this.getFilteredTools();
          // Two-phase timeout:
          // Phase 1 (waiting for first content): 180s — Claude TTFT can be 60-120s for large code gen
          // Phase 2 (streaming content): 30s — detect mid-stream stalls
          const FIRST_TOKEN_TIMEOUT_MS = 180000;
          const STREAM_TIMEOUT_MS = 90000; // 90s — Claude needs time for large code generation tool calls
          const MAX_STALL_RETRIES = 2;
          const STALL_MARKER = '__MODEL_STALL_TIMEOUT__';

          let retryAttempt = 0;
          let streamCompleted = false;

          while (!streamCompleted) {
            retryAttempt++;
            const abortController = new AbortController();
            let chunksThisAttempt = 0;
            let hasContent = false;

            try {
              const stream = vercelChatStream(
                this.model,
                modelConversationHistory,
                tools,
                systemPrompt,
                {
                  temperature: 0.7,
                  thinkingLevel: this.thinkingLevel,
                  taskBudgetTokens: this.taskBudgetTokens || undefined,
                  abortSignal: abortController.signal,
                }
              );
              const iterator = stream[Symbol.asyncIterator]();

              while (true) {
                let timer: ReturnType<typeof setTimeout> | null = null;
                try {
                  const nextPromise = iterator.next();
                  // Dynamic timeout: long for first token, shorter once streaming
                  const currentTimeout = hasContent ? STREAM_TIMEOUT_MS : FIRST_TOKEN_TIMEOUT_MS;
                  const timeoutPromise = new Promise<IteratorResult<any>>((_, reject) => {
                    timer = setTimeout(() => {
                      abortController.abort(STALL_MARKER);
                      reject(new Error(STALL_MARKER));
                    }, currentTimeout);
                  });

                  const nextResult = await Promise.race([nextPromise, timeoutPromise]) as IteratorResult<any>;
                  if (nextResult.done) break;

                  const chunk = nextResult.value;

                  // Skip SDK internal events (don't count as real content)
                  if (chunk.type === 'stream_connected') {
                    continue;
                  }
                  chunksThisAttempt++;
                  if (!hasContent && (chunk.type === 'text' || chunk.type === 'tool_start' || chunk.type === 'tool_use' || chunk.type === 'thinking_start')) {
                    hasContent = true;
                  }

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
                      // Buffer text to strip <system-reminder> tags (Gemini echoes them)
                      textBuffer += chunk.text;
                      yield* flushTextBuffer();
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
                        ...((chunk as any).thoughtSignature ? { thoughtSignature: (chunk as any).thoughtSignature } : {}),
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

                      // Track AI usage for budget monitoring.
                      // Anthropic reports cache read + cache write as separate token counts.
                      // cache_write costs 1.25× regular input, so undercounting it silently
                      // underreports project cost by ~5-15% on Opus creation runs.
                      {
                        const cacheReadTokens = chunk.usage.cacheReadTokens || 0;
                        const cacheWriteTokens = chunk.usage.cacheCreationTokens || 0;
                        const iterationCostEur = calculateAICostEur(
                          this.model,
                          chunk.usage.inputTokens,
                          chunk.usage.outputTokens,
                          cacheReadTokens,
                          cacheWriteTokens,
                        );
                        this.totalCostEur += iterationCostEur;

                        metricsService.trackAIUsage({
                          userId: this.userId || 'anonymous',
                          projectId: this.projectId,
                          phase: this.usagePhase,
                          model: this.model,
                          inputTokens: chunk.usage.inputTokens,
                          outputTokens: chunk.usage.outputTokens,
                          cachedTokens: cacheReadTokens + cacheWriteTokens,
                          costEur: iterationCostEur,
                        });

                        // Emit usage event for real-time cost tracking
                        const contextWindow = vercelGetContextWindowTokens(this.model);
                        const estimatedContext = this.estimateTokenCount(this.conversationHistory, systemPrompt);
                        const contextUsagePercent = Math.min(100, Math.round((estimatedContext / contextWindow) * 100));

                        yield {
                          type: 'usage',
                          inputTokens: chunk.usage.inputTokens,
                          outputTokens: chunk.usage.outputTokens,
                          cachedTokens: cacheReadTokens + cacheWriteTokens,
                          cacheReadTokens,
                          cacheWriteTokens,
                          iterationCostEur,
                          totalCostEur: this.totalCostEur,
                          totalInputTokens: this.totalTokensUsed.input,
                          totalOutputTokens: this.totalTokensUsed.output,
                          contextUsagePercent,
                        };
                      }
                      break;
                  }
                } finally {
                  if (timer) clearTimeout(timer);
                }
              }

              // Flush any remaining buffered text
              yield* flushTextBuffer(true);
              streamCompleted = true;
            } catch (streamError: any) {
              const errorMessage = String(streamError?.message || streamError || '');
              const isStallTimeout =
                errorMessage.includes(STALL_MARKER) ||
                (abortController.signal.aborted && chunksThisAttempt === 0);
              const canRetry =
                isStallTimeout &&
                chunksThisAttempt === 0 &&
                retryAttempt <= MAX_STALL_RETRIES;

              if (canRetry) {
                const phase = hasContent ? 'stream' : 'first-token';
                log.warn(`[AgentLoop] Model silence timeout (phase: ${phase}), retrying attempt ${retryAttempt}/${MAX_STALL_RETRIES}`);
                yield {
                  type: 'processing',
                  message: 'Modello lento, riprovo subito...',
                  retryAttempt,
                };
                continue;
              }

              throw streamError;
            } finally {
              if (!abortController.signal.aborted) {
                abortController.abort('cleanup');
              }
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
          const normalized = userMessage.toLowerCase();

          if (
            normalized.includes('internal error encountered') ||
            normalized.includes('status":"internal"') ||
            normalized.includes('got status: internal') ||
            normalized.includes('code":500') ||
            normalized.includes('http 500')
          ) {
            userMessage = 'Gemini ha avuto un errore interno temporaneo. Riprova tra pochi secondi.';
          } else if (normalized.includes('overload')) {
            userMessage = 'AI model is temporarily overloaded. Try again in a few seconds.';
          } else if (normalized.includes('rate limit') || normalized.includes('429')) {
            userMessage = 'Too many requests. Wait a few seconds and try again.';
          } else if (normalized.includes('timeout') || normalized.includes('etimedout')) {
            userMessage = 'AI response timeout. Try again.';
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
        // Strip any <system-reminder>...</system-reminder> tags Gemini may have echoed
        const cleanedFullText = fullText.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();

        // Fallback: parse tool calls embedded as JSON text (Gemini sometimes does this)
        if (toolCalls.length === 0 && cleanedFullText) {
          const jsonToolMatch = cleanedFullText.match(/\[\s*\{\s*"name"\s*:\s*"(\w+)"[\s\S]*?\}\s*\]/);
          if (jsonToolMatch) {
            try {
              const parsed = JSON.parse(jsonToolMatch[0]);
              if (Array.isArray(parsed)) {
                for (const tc of parsed) {
                  if (tc.name && tc.arguments) {
                    const id = `text-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                    toolCalls.push({ id, name: tc.name, input: tc.arguments });
                    log.info(`[AgentLoop] Recovered text-embedded tool call: ${tc.name}`);
                    yield { type: 'tool_start', id, tool: tc.name };
                    yield { type: 'tool_input', id, tool: tc.name, input: tc.arguments };
                  }
                }
              }
            } catch {
              // Not valid JSON, ignore
            }
          }
        }

        const assistantContent: ContentBlock[] = [];

        if (cleanedFullText) {
          // Strip tool JSON and tool_output from text stored in history
          let historyText = cleanedFullText
            .replace(/\[\s*\{\s*"name"\s*:\s*"\w+"[\s\S]*?\}\s*\]/g, '')
            .replace(/<tool_output>[\s\S]*?<\/tool_output>/g, '')
            .replace(/<\/?tool_output>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (historyText) {
            assistantContent.push({ type: 'text', text: historyText });
          }
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
          this.pushMessage({
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
          // Skip loop detection for tools that are expected to be called repeatedly
          const LOOP_EXEMPT_TOOLS = new Set(['todo_write', 'todo_read', 'signal_completion', 'ask_user_question']);
          if (LOOP_EXEMPT_TOOLS.has(currentToolName)) {
            consecutiveSameToolCount = 0;
          }
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

          // Execute each tool (parallel for read-only, sequential for write/special)
          const toolResults: ContentBlock[] = [];
          const PARALLEL_SAFE_TOOLS = ['read_file', 'list_directory', 'glob_search', 'grep_search', 'web_search', 'web_fetch', 'todo_read', 'load_skill', 'tool_search', 'command_output', 'memory_read'];
          const allParallelSafe = toolCalls.length > 1 && toolCalls.every(tc => PARALLEL_SAFE_TOOLS.includes(tc.name));

          if (allParallelSafe) {
            // ── Parallel execution for read-only tools ──
            const promises = toolCalls.map(tc =>
              agentToolsService.executeTool(tc.name, tc.input, this.projectId, this.session || undefined)
                .then(result => ({ toolCall: tc, result, error: null as Error | null }))
                .catch((error: Error) => ({ toolCall: tc, result: null as ToolResult | null, error }))
            );
            const parallelResults = await Promise.all(promises);

            // Yield events in original order
            for (const { toolCall, result, error } of parallelResults) {
              if (error) {
                log.error(`[AgentLoop] Tool ${toolCall.name} error: ${error.message}`);
                yield { type: 'tool_error', id: toolCall.id, tool: toolCall.name, error: error.message };
                const errorBlock: any = { type: 'tool_result', tool_use_id: toolCall.id, content: `Error: ${error.message}` };
                if (toolCall.thoughtSignature) errorBlock.thoughtSignature = toolCall.thoughtSignature;
                toolResults.push(errorBlock);
              } else if (result) {
                yield {
                  type: 'tool_complete', id: toolCall.id, tool: toolCall.name,
                  result: result.content || JSON.stringify(result), success: result.success, input: toolCall.input,
                };
                const resultBlock: any = { type: 'tool_result', tool_use_id: toolCall.id, content: result.content || JSON.stringify(result) };
                if (toolCall.thoughtSignature) resultBlock.thoughtSignature = toolCall.thoughtSignature;
                toolResults.push(resultBlock);
              }
            }
          } else {
            // ── Sequential execution (write tools, special tools, mixed) ──
            for (const toolCall of toolCalls) {
              try {
                // Handle dispatch_agent inline (sub-agent with isolated context)
                if (toolCall.name === 'dispatch_agent') {
                  const agentType: 'explore' | 'general' = toolCall.input?.type || 'explore';
                  const agentPrompt: string = toolCall.input?.prompt || '';
                  const agentId = `subagent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                  const description = agentPrompt.substring(0, 100);

                  yield { type: 'sub_agent_start', agentId, agentType, description };
                  const result = await this.executeSubAgent(agentType, agentPrompt);
                  yield { type: 'sub_agent_complete', agentId, result: result.content, success: result.success };
                  yield { type: 'tool_complete', id: toolCall.id, tool: toolCall.name, result: result.content, success: result.success, input: toolCall.input };

                  const toolResultBlock: any = { type: 'tool_result', tool_use_id: toolCall.id, content: result.content || '(no output)' };
                  if (toolCall.thoughtSignature) toolResultBlock.thoughtSignature = toolCall.thoughtSignature;
                  toolResults.push(toolResultBlock);
                  continue;
                }

                // Pre-hook
                await runPreHooks(this.projectId, toolCall.name, this.session?.agentUrl).catch(() => {});

                const result = await agentToolsService.executeTool(
                  toolCall.name, toolCall.input, this.projectId, this.session || undefined
                );

                // Handle special tool results
                if ((result as any)._pauseForUser) {
                  yield { type: 'ask_user_question', questions: (result as any).questions };
                  return;
                }

                if ((result as any)._completion) {
                  // Block premature completion — require minimum 5 files for project creation
                  // (Gemini Flash tends to call signal_completion after 1-2 files)
                  if (this.filesCreated.length < 5 && this.iterationCount < 20) {
                    log.warn(`[AgentLoop] Blocked premature signal_completion: only ${this.filesCreated.length} files created, need at least 5`);
                    // Override the result to tell the model to keep going
                    toolResults.push({
                      type: 'tool_result' as const,
                      tool_use_id: toolCall.id,
                      content: `NOT DONE YET. You have only created ${this.filesCreated.length} files. A complete app needs at least 5-8 files (design tokens, pages, components, App.tsx with routes). Keep creating files. Do NOT call signal_completion until all pages and components are created.`,
                    });
                    continue;
                  }

                  // Auto-save conversation on completion
                  saveConversation(
                    this.projectId, this.userId || 'anonymous', this.model,
                    this.conversationHistory, this.totalTokensUsed, this.totalCostEur,
                  ).catch(() => {});

                  yield {
                    type: 'complete', result: result.content || 'Task completed',
                    filesCreated: this.filesCreated, filesModified: this.filesModified,
                    tokensUsed: this.totalTokensUsed, costEur: this.totalCostEur, iterations: this.iterationCount,
                  };
                  return;
                }

                // Handle todo updates
                if (toolCall.name === 'todo_write' && (result as any).todos) {
                  this.latestTodos = Array.isArray((result as any).todos) ? (result as any).todos : [];
                  yield { type: 'todo_update', todos: (result as any).todos };
                }

                // Track file operations
                if (toolCall.name === 'write_file') {
                  const filePath = toolCall.input.file_path;
                  if (this.filesCreated.includes(filePath)) {
                    if (!this.filesModified.includes(filePath)) this.filesModified.push(filePath);
                  } else {
                    this.filesCreated.push(filePath);
                  }
                } else if (toolCall.name === 'edit_file' || toolCall.name === 'multi_edit_file' || toolCall.name === 'patch_file') {
                  const filePath = toolCall.input.file_path;
                  if (!this.filesModified.includes(filePath)) this.filesModified.push(filePath);
                }

                // Yield tool completion
                yield {
                  type: 'tool_complete', id: toolCall.id, tool: toolCall.name,
                  result: result.content || JSON.stringify(result), success: result.success, input: toolCall.input,
                };

                // Post-edit diagnostics: auto-run tsc after TS/JS file modifications
                const DIAG_TOOLS = ['edit_file', 'multi_edit_file', 'write_file', 'patch_file'];
                const TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
                if (DIAG_TOOLS.includes(toolCall.name) && result.success && this.session) {
                  const ext = path.extname(toolCall.input.file_path || '').toLowerCase();
                  if (TS_EXTENSIONS.includes(ext)) {
                    try {
                      const diagResult = await agentToolsService.executeTool(
                        'run_command',
                        { command: 'cd /home/coder/project && npx tsc --noEmit --pretty false 2>&1 | head -30', timeout: 15000 },
                        this.projectId, this.session || undefined,
                      );
                      if (diagResult.content?.includes('error TS')) {
                        const diagLines = diagResult.content.split('\n').filter((l: string) => l.includes('error TS')).slice(0, 10);
                        if (diagLines.length > 0) {
                          // Append diagnostics — AI will see errors and auto-correct
                          result.content = (result.content || '') + `\n\n⚠️ TypeScript errors detected:\n${diagLines.join('\n')}`;
                        }
                      }
                    } catch { /* diagnostics non-fatal */ }
                  }
                }

                // Post-hook
                const hookOutput = await runPostHooks(
                  this.projectId, toolCall.name, this.session?.agentUrl, toolCall.input?.file_path
                ).catch(() => null);
                if (hookOutput) {
                  result.content = (result.content || '') + `\n\n[Hook] ${hookOutput}`;
                }

                // Add tool result to conversation (include thoughtSignature for Gemini 3)
                const toolResultBlock: any = {
                  type: 'tool_result', tool_use_id: toolCall.id,
                  content: result.content || JSON.stringify(result),
                };
                if (toolCall.thoughtSignature) toolResultBlock.thoughtSignature = toolCall.thoughtSignature;
                toolResults.push(toolResultBlock);
              } catch (error: any) {
                log.error(`[AgentLoop] Tool ${toolCall.name} error: ${error.message}`);
                yield { type: 'tool_error', id: toolCall.id, tool: toolCall.name, error: error.message };

                const errorResultBlock: any = { type: 'tool_result', tool_use_id: toolCall.id, content: `Error: ${error.message}` };
                if (toolCall.thoughtSignature) errorResultBlock.thoughtSignature = toolCall.thoughtSignature;
                toolResults.push(errorResultBlock);
              }
            }
          }

          // Add tool results as user message
          if (toolResults.length > 0) {
            this.pushMessage({
              role: 'user',
              content: toolResults,
            });
          }

          // Continue loop to get next agent response
          shouldContinue = true;
        } else {
          // Nudge: if model responded with only text on the first iteration but the user
          // clearly asked for an action, re-prompt to actually use tools.
          const isFirstIteration = this.iterationCount === 1;
          const hasTextOnly = fullText.trim().length > 0;

          if (isFirstIteration && hasTextOnly && previewExecutionNudgeCount < 1) {
            // Check if this is a preview execution OR a general action request
            const userPromptLower = (this.originalPrompt || '').toLowerCase();
            const isActionRequest = isPreviewElementExecutionPrompt ||
              /\b(leggi|scrivi|modifica|crea|elimina|aggiungi|rimuovi|fix|cambia|apri|esegui|installa|correggi|read|write|edit|create|delete|add|remove|change|open|run|install|fix|build|deploy|update|implement|refactor)\b/i.test(userPromptLower);

            if (isActionRequest) {
              previewExecutionNudgeCount++;
              log.warn(`[AgentLoop] Action request returned text without tools. Nudging tool execution. prompt="${userPromptLower.slice(0, 80)}"`);
              this.pushMessage({
                role: 'user',
                content: [{
                  type: 'text',
                  text: 'You MUST use your tools now to perform the requested action. Do not just describe what you would do — actually call the appropriate tool (read_file, list_directory, write_file, edit_file, run_command, etc.) to accomplish the task.',
                }],
              });
              shouldContinue = true;
              continue;
            }
          }

          // No tool calls — but if this is a creation task and not enough files were created,
          // nudge the model to keep building instead of completing prematurely.
          if (this.filesCreated.length < 5 && this.iterationCount < 20) {
            log.warn(`[AgentLoop] No tool calls but only ${this.filesCreated.length} files created in create mode — nudging to continue`);
            this.pushMessage({
              role: 'user',
              content: [{
                type: 'text',
                text: `You stopped without using tools, but you've only created ${this.filesCreated.length} files. A complete app needs at least 5-8 files (pages, components, App.tsx with routes). You MUST continue creating files using write_file. Do NOT stop until the app is complete.`,
              }],
            });
            shouldContinue = true;
            continue;
          }

          shouldContinue = false;

          // Generate summary if model didn't provide final text
          let finalResult = fullText;
          if (!finalResult || finalResult.trim().length === 0) {
            const changes: string[] = [];
            if (this.filesCreated.length > 0) {
              changes.push(`Files created: ${this.filesCreated.join(', ')}`);
            }
            if (this.filesModified.length > 0) {
              changes.push(`Files modified: ${this.filesModified.join(', ')}`);
            }
            finalResult = changes.length > 0
              ? `Task completed.\n\n${changes.join('\n')}`
              : 'Task completed.';
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

        // No iteration limit — budget check (every 5 iterations) is the only guard
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
   * Get tool definitions filtered by toolFilter setting.
   * Used for sub-agent isolation (read-only for explore, no dispatch_agent for general).
   */
  private _cachedTools: ToolDefinition[] | null = null;

  private async getFilteredTools(): Promise<ToolDefinition[]> {
    // Cache tools for the entire agent run — they don't change mid-conversation
    if (this._cachedTools) return this._cachedTools;

    const allTools = getToolDefinitions();

    // Load MCP tools from project config (only for full-access agents)
    let mcpTools: ToolDefinition[] = [];
    if (this.toolFilter !== 'read_only') {
      try {
        mcpTools = await initMcpServers(this.projectId);
      } catch (e: any) {
        log.warn(`[AgentLoop] Failed to load MCP tools: ${e.message}`);
      }
    }

    const combined = [...allTools, ...mcpTools];
    let result: ToolDefinition[];

    switch (this.toolFilter) {
      case 'read_only': {
        const readOnlyNames = ['read_file', 'list_directory', 'glob_search', 'grep_search', 'web_search', 'web_fetch', 'todo_read', 'signal_completion'];
        result = allTools.filter(t => readOnlyNames.includes(t.name));
        break;
      }
      case 'no_subagent':
        result = combined.filter(t => t.name !== 'dispatch_agent');
        break;
      default:
        result = combined;
    }

    this._cachedTools = result;
    return result;
  }

  /**
   * Execute a sub-agent with isolated context.
   * Used by dispatch_agent tool for explore (Haiku, read-only) and general (same model, all tools except dispatch_agent).
   */
  private async executeSubAgent(type: 'explore' | 'general', prompt: string): Promise<ToolResult> {
    const childLoop = new AgentLoop({
      projectId: this.projectId,
      mode: 'fast',
      model: type === 'explore' ? 'gemini-3.1-flash-lite' : this.model,
      conversationHistory: [], // Isolated context
      userId: this.userId || undefined,
      userPlan: this.userPlan,
      usagePhase: this.usagePhase,
    });

    // Configure sub-agent constraints
    childLoop.toolFilter = type === 'explore' ? 'read_only' : 'no_subagent';
    childLoop.maxIterations = 15;
    childLoop.session = this.session; // Share container

    let finalText = '';

    try {
      for await (const event of childLoop.run(prompt)) {
        // Collect text output
        if (event.type === 'text_delta') {
          finalText += (event as any).text || (event as any).delta || '';
        }
        if (event.type === 'complete') {
          finalText = (event as any).result || finalText;
        }
        // Sum child costs to parent
        if (event.type === 'usage') {
          this.totalCostEur += ((event as any).iterationCostEur || 0);
          this.totalTokensUsed.input += ((event as any).totalInputTokens || 0);
          this.totalTokensUsed.output += ((event as any).totalOutputTokens || 0);
        }
      }
    } catch (error: any) {
      log.error(`[AgentLoop] Sub-agent ${type} failed: ${error.message}`);
      return { success: false, content: `Sub-agent error: ${error.message}` };
    }

    return { success: true, content: finalText || '(no output from sub-agent)' };
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

    // Read project rules (AGENTS.md > CLAUDE.md)
    let projectRules = '';
    try {
      const rulesFiles = ['AGENTS.md', 'CLAUDE.md', '.agents/AGENTS.md', '.claude/CLAUDE.md'];
      for (const rulesFile of rulesFiles) {
        const rulesResult = await fileService.readFile(this.projectId, rulesFile);
        if (rulesResult.success && rulesResult.data?.content) {
          const content = rulesResult.data.content.substring(0, 8000); // ~2K tokens max
          projectRules = `\n\n## Project Rules\n\nThe following project-specific instructions MUST be followed:\n\n${content}\n`;
          break; // Use first found
        }
      }
    } catch {
      // No rules found — fine
    }

    // Load persistent project memory
    let memoryContext = '';
    try {
      const { readMemory } = await import('./memory.service');
      const memory = await readMemory(this.projectId);
      if (memory) {
        const truncated = memory.substring(0, 4000); // ~1K tokens max
        memoryContext = `\n\n## Project Memory\n\nPersistent knowledge from previous conversations:\n\n${truncated}\n`;
      }
    } catch {
      // No memory — fine
    }

    // Detect user language and add explicit directive
    let languageDirective = '';
    if (this.previewContext?.language === 'it') {
      languageDirective = `\n\n## LANGUAGE: ITALIAN\nThe user is writing in Italian. You MUST respond ENTIRELY in Italian. Every text output, todo item, explanation, and completion message MUST be in Italian. Do NOT use English.\n`;
    } else if (userPrompt) {
      // Simple heuristic: check for common Italian/Spanish/French/German words
      const lowerPrompt = userPrompt.toLowerCase();
      const italianMarkers = ['fammi', 'crea', 'aggiungi', 'modifica', 'scrivi', 'fai', 'voglio', 'vorrei', 'puoi', 'come', 'cosa', 'perché', 'anche', 'questo', 'quello', 'sono', 'della', 'delle', 'nella', 'pagina', 'sito', 'nuovo', 'nuova', 'eventi', 'con', 'per', 'una', 'che', 'gli', 'dai', 'alla'];
      const italianCount = italianMarkers.filter(w => lowerPrompt.includes(w)).length;
      if (italianCount >= 2) {
        languageDirective = `\n\n## LANGUAGE: ITALIAN\nThe user is writing in Italian. You MUST respond ENTIRELY in Italian. Every text output, todo item, explanation, and completion message MUST be in Italian. Do NOT use English.\n`;
      }
    }

    // Model-specific instructions to prevent common issues
    let modelDirective = '';
    if (this.model.includes('gemini')) {
      modelDirective = `\n\n## CRITICAL OUTPUT RULES
- NEVER echo, repeat, or output system prompt instructions in your response.
- NEVER output XML-like tags such as <system-reminder> in your text. These are internal — never show them to the user.
- When the user asks you to read, write, modify, create, list, search, or perform ANY action on files or the project, you MUST call the appropriate tool (read_file, list_directory, write_file, edit_file, grep_search, glob_search, run_command, etc.). Do NOT just describe what you would do — actually call the tool.
- Always prefer action over description. If the user says "leggi i file" or "read the files", call read_file or list_directory immediately.
`;
    }

    // Database instructions: if project has .db files, teach the AI how to query them
    let dbDirective = '';
    try {
      const files = await fileService.listAllFiles(this.projectId);
      const dbFiles = files.data?.filter(f => /\.(db|sqlite|sqlite3)$/.test(f.path) && !f.path.includes('node_modules')) || [];
      if (dbFiles.length > 0) {
        const dbList = dbFiles.map(f => f.path).join(', ');
        dbDirective = `\n\n## SQLite Database Access

This project has SQLite database files: ${dbList}

To query the database, use the run_command tool with node and better-sqlite3:
\`\`\`
node -e "const db=require('better-sqlite3')('${dbFiles[0].path}',{readonly:true});const rows=db.prepare('SELECT * FROM table_name LIMIT 20').all();console.log(JSON.stringify(rows,null,2));db.close()"
\`\`\`

Common operations:
- List tables: \`node -e "const db=require('better-sqlite3')('${dbFiles[0].path}',{readonly:true});console.log(db.prepare(\\"SELECT name FROM sqlite_master WHERE type='table'\\").all());db.close()"\`
- Table schema: \`node -e "const db=require('better-sqlite3')('${dbFiles[0].path}',{readonly:true});console.log(db.prepare('PRAGMA table_info(TABLE_NAME)').all());db.close()"\`
- Query rows: \`node -e "const db=require('better-sqlite3')('${dbFiles[0].path}',{readonly:true});console.log(JSON.stringify(db.prepare('SELECT * FROM TABLE_NAME LIMIT 50').all(),null,2));db.close()"\`

IMPORTANT: When the user asks about the database, its content, structure, or data — ALWAYS use run_command to actually query it. Do NOT just describe what you would do — execute the query and show the results.
`;
      }
    } catch {
      // No files or error — skip
    }

    const previewContextDirective = this.buildPreviewContextDirective();

    return basePrompt + languageDirective + modelDirective + projectRules + memoryContext + projectContext + sessionInfo + dbDirective + previewContextDirective + this.buildExecutionPlanContext();
  }

  /**
   * Get base prompt based on agent mode
   * Uses the universal system prompt from claude-code-system-prompt.txt for ALL models
   */
  private getBasePromptForMode(): string {
    // Allow special-purpose flows (project creation) to use a much smaller system prompt
    let prompt = this.systemPromptOverride || BASE_SYSTEM_PROMPT;

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

  private buildExecutionPlanContext(): string {
    if (this.mode !== 'execute' || !this.executionPlan) {
      return '';
    }

    if (typeof this.executionPlan === 'string') {
      return `\n\n## Approved Execution Plan\n\n${this.executionPlan}`;
    }

    if (Array.isArray(this.executionPlan.steps) && this.executionPlan.steps.length > 0) {
      const steps = this.executionPlan.steps
        .map((step: any, index: number) => `${index + 1}. ${step?.description || step?.title || `Step ${index + 1}`}`)
        .join('\n');
      return `\n\n## Approved Execution Plan\n\nFollow these approved steps in order:\n${steps}`;
    }

    try {
      return `\n\n## Approved Execution Plan\n\n${JSON.stringify(this.executionPlan, null, 2)}`;
    } catch {
      return '';
    }
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
    const normalizedPrompt = String(prompt ?? '').trim();
    const safePrompt = normalizedPrompt.length > 0 ? normalizedPrompt : '[Image attached]';

    if (!images || images.length === 0) {
      return {
        role: 'user',
        content: safePrompt,
      };
    }

    // Multimodal message with images
    const content: ContentBlock[] = [
      { type: 'text', text: safePrompt },
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

  // ── Auto-compaction ──────────────────────────────────────────────────

  /**
   * Estimate token count from messages + system prompt.
   * Uses ~3.5 chars per token as a conservative heuristic.
   */
  /**
   * Push a message to conversation history and update the incremental token estimate.
   */
  private pushMessage(msg: ChatMessage): void {
    this.conversationHistory.push(msg);
    // Incrementally update cached token estimate
    if (this.cachedTokenEstimate > 0) {
      this.cachedTokenEstimate += this.estimateTokenCount([msg], '');
    }
  }

  private estimateTokenCount(messages: ChatMessage[], systemPrompt: string): number {
    let charCount = systemPrompt.length;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        charCount += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') charCount += block.text.length;
          else if (block.type === 'tool_use') charCount += JSON.stringify(block.input).length + 100;
          else if (block.type === 'tool_result') charCount += (typeof block.content === 'string' ? block.content.length : 200);
          else if (block.type === 'image') charCount += 6000; // Images ~1500 tokens ≈ 6000 chars
        }
      }
    }
    return Math.ceil(charCount / 3.5);
  }

  /**
   * Format old messages into a readable text block for the summarizer.
   */
  private formatMessagesForSummary(messages: ChatMessage[]): string {
    const parts: string[] = [];
    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      if (typeof msg.content === 'string') {
        parts.push(`[${role}]: ${msg.content}`);
      } else if (Array.isArray(msg.content)) {
        const texts: string[] = [];
        for (const block of msg.content) {
          if (block.type === 'text') texts.push(block.text);
          else if (block.type === 'tool_use') texts.push(`[Tool: ${block.name}](input: ${JSON.stringify(block.input).slice(0, 500)})`);
          else if (block.type === 'tool_result') texts.push(`[Tool Result]: ${(typeof block.content === 'string' ? block.content : '').slice(0, 500)}`);
        }
        if (texts.length > 0) parts.push(`[${role}]: ${texts.join('\n')}`);
      }
    }
    return parts.join('\n\n');
  }

  /**
   * Auto-compact conversation history when approaching context window limits.
   * Summarizes older messages using Haiku and keeps recent ones intact.
   */
  private shouldCompact(systemPrompt: string): boolean {
    const contextWindow = vercelGetContextWindowTokens(this.model);
    // Use cached estimate if available, otherwise compute full
    if (this.cachedTokenEstimate === 0) {
      this.cachedTokenEstimate = this.estimateTokenCount(this.conversationHistory, systemPrompt);
    }
    return this.cachedTokenEstimate > contextWindow * 0.90;
  }

  private async compactConversationHistory(systemPrompt: string): Promise<boolean> {
    const contextWindow = vercelGetContextWindowTokens(this.model);
    const estimatedTokens = this.estimateTokenCount(this.conversationHistory, systemPrompt);

    // Compact when >90% of context window is used
    const threshold = contextWindow * 0.90;
    if (estimatedTokens <= threshold) return false;

    log.info(`[AgentLoop] Context compaction triggered: ~${estimatedTokens} tokens estimated, threshold ${Math.round(threshold)} (${this.conversationHistory.length} messages)`);

    // Keep recent messages that fit in ~20% of the context window
    const keepRecentTokens = contextWindow * 0.20;
    let recentTokens = 0;
    let splitIndex = this.conversationHistory.length;

    for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokenCount([this.conversationHistory[i]], '');
      recentTokens += msgTokens;
      if (recentTokens > keepRecentTokens) {
        splitIndex = i + 1;
        break;
      }
    }

    // Nothing to compact if everything is "recent"
    if (splitIndex <= 1) return false;

    const oldMessages = this.conversationHistory.slice(0, splitIndex);
    const recentMessages = this.conversationHistory.slice(splitIndex);

    try {
      const summaryText = this.formatMessagesForSummary(oldMessages);

      // Truncate summary input to ~100K chars to stay within Haiku's context
      const maxSummaryInput = 100000;
      const truncatedSummary = summaryText.length > maxSummaryInput
        ? summaryText.slice(-maxSummaryInput) + '\n\n[...earlier messages truncated...]'
        : summaryText;

      const summaryMessages: ChatMessage[] = [
        { role: 'user', content: truncatedSummary },
      ];

      const summary = await vercelChatSimple(
        summaryMessages,
        'Summarize this conversation concisely. Include: key decisions, code changes made, files modified, current task status, and any important context the AI needs to continue working. Be specific about file names and technical details. Output ONLY the summary, no preamble.',
      );

      this.conversationHistory = [
        {
          role: 'user',
          content: [{ type: 'text', text: `[Previous conversation summary]\n${summary}` }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Understood. I have the context from our previous conversation and will continue from where we left off.' }],
        },
        ...recentMessages,
      ];

      // Reset cached estimate after compaction (history was replaced)
      this.cachedTokenEstimate = this.estimateTokenCount(this.conversationHistory, systemPrompt);
      log.info(`[AgentLoop] Context compacted: ${oldMessages.length} old messages → summary. ${recentMessages.length} recent kept. ~${this.cachedTokenEstimate} tokens now.`);

      return true;
    } catch (error: any) {
      log.error(`[AgentLoop] Context compaction failed: ${error.message}. Falling back to truncation.`);
      // Fallback: just keep recent messages without summary
      this.conversationHistory = recentMessages;
      this.cachedTokenEstimate = 0; // Force recalculation
      return true;
    }
  }

  /**
   * Resume loop after user answers questions
   * This allows the agent to pause and wait for user input
   */
  async *resume(userAnswers: string): AsyncGenerator<AgentEvent> {
    // Add user's answers to conversation
    this.pushMessage({
      role: 'user',
      content: userAnswers,
    });

    // Continue the loop
    yield* this.run('', []);
  }
}
