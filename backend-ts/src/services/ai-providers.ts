/**
 * Vercel AI SDK provider abstraction layer.
 * Maps Drape model names to Vercel SDK provider instances and provides
 * streaming/simple chat that produces the same StreamChunk events as ai-provider.service.ts.
 */
import { streamText, generateText, generateObject, jsonSchema, type ModelMessage, type TextPart } from 'ai';
import { z } from 'zod';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../config';
import { log } from '../utils/logger';
import type { ChatMessage, ContentBlock, ToolDefinition, StreamChunk, UsageInfo, ToolCall } from './ai-provider.service';

// ── Provider Instances ──────────────────────────────────────────────────────

const anthropicProvider = config.anthropicApiKey
  ? createAnthropic({ apiKey: config.anthropicApiKey })
  : null;

const googleProvider = config.geminiApiKey
  ? createGoogleGenerativeAI({ apiKey: config.geminiApiKey })
  : null;

const openaiProvider = config.openaiApiKey
  ? createOpenAI({ apiKey: config.openaiApiKey })
  : null;

const groqProvider = config.groqApiKey
  ? createOpenAI({ apiKey: config.groqApiKey, baseURL: 'https://api.groq.com/openai/v1' })
  : null;

// ── Model Registry ──────────────────────────────────────────────────────────

interface ModelEntry {
  provider: 'anthropic' | 'google' | 'openai' | 'groq';
  modelId: string;
  maxTokens: number;
  contextWindowTokens: number;
}

const MODEL_REGISTRY: Record<string, ModelEntry> = {
  'claude-sonnet-4':    { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', maxTokens: 8192, contextWindowTokens: 200000 },
  'claude-4-6-sonnet':  { provider: 'anthropic', modelId: 'claude-sonnet-4-6', maxTokens: 8192, contextWindowTokens: 200000 },
  'claude-4-6-opus':    { provider: 'anthropic', modelId: 'claude-opus-4-6', maxTokens: 8192, contextWindowTokens: 200000 },
  'claude-3.5-haiku':   { provider: 'anthropic', modelId: 'claude-haiku-4-5-20251001', maxTokens: 8192, contextWindowTokens: 200000 },
  'gemini-2.5-flash':   { provider: 'google', modelId: 'gemini-2.5-flash', maxTokens: 65536, contextWindowTokens: 1000000 },
  'gemini-3.1-flash-lite': { provider: 'google', modelId: 'gemini-3.1-flash-lite-preview', maxTokens: 65536, contextWindowTokens: 1048576 },
  'gemini-3-flash':     { provider: 'google', modelId: 'gemini-3-flash-preview', maxTokens: 65536, contextWindowTokens: 1000000 },
  'gemini-3.1-pro':     { provider: 'google', modelId: 'gemini-3.1-pro-preview', maxTokens: 65536, contextWindowTokens: 1000000 },
  'gpt-5-3':            { provider: 'openai', modelId: 'gpt-5.3', maxTokens: 16384, contextWindowTokens: 128000 },
  'llama-3.3-70b':      { provider: 'groq', modelId: 'llama-3.3-70b-versatile', maxTokens: 8192, contextWindowTokens: 128000 },
};

// ── Provider Resolution ─────────────────────────────────────────────────────

function getVercelModel(modelName: string) {
  const entry = MODEL_REGISTRY[modelName];
  if (!entry) throw new Error(`Unknown model: ${modelName}`);

  switch (entry.provider) {
    case 'anthropic':
      if (!anthropicProvider) throw new Error('Anthropic API key not configured');
      return anthropicProvider(entry.modelId);
    case 'google':
      if (!googleProvider) throw new Error('Google API key not configured');
      return googleProvider(entry.modelId);
    case 'openai':
      if (!openaiProvider) throw new Error('OpenAI API key not configured');
      return openaiProvider(entry.modelId);
    case 'groq':
      if (!groqProvider) throw new Error('Groq API key not configured');
      return groqProvider(entry.modelId);
    default:
      throw new Error(`Unsupported provider: ${entry.provider}`);
  }
}

// ── Message Conversion ──────────────────────────────────────────────────────

/**
 * Convert our ChatMessage[] format to Vercel's ModelMessage[] format.
 */
function convertMessages(messages: ChatMessage[]): ModelMessage[] {
  const result: ModelMessage[] = [];

  // Track tool call IDs → tool names for tool result messages
  const toolCallNames = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === 'system') continue; // System messages handled separately

    const blocks: ContentBlock[] = typeof msg.content === 'string'
      ? [{ type: 'text', text: msg.content }]
      : (msg.content || []);

    if (msg.role === 'user') {
      // Check if this message contains tool_result blocks
      const toolResults = blocks.filter(b => b.type === 'tool_result');
      const nonToolBlocks = blocks.filter(b => b.type !== 'tool_result');

      // If there are tool results, emit them as a separate tool message
      if (toolResults.length > 0) {
        result.push({
          role: 'tool',
          content: toolResults.map(tr => {
            const toolUseId = (tr as any).tool_use_id || '';
            const rawContent = (tr as any).content || '';
            const textValue = typeof rawContent === 'string'
              ? rawContent
              : JSON.stringify(rawContent);
            return {
              type: 'tool-result' as const,
              toolCallId: toolUseId,
              toolName: toolCallNames.get(toolUseId) || 'unknown',
              output: { type: 'text' as const, value: textValue },
            };
          }),
        } as any);
      }

      // If there are also non-tool blocks, emit them as a user message
      if (nonToolBlocks.length > 0) {
        const userContent: any[] = [];
        for (const block of nonToolBlocks) {
          if (block.type === 'text' && (block as any).text?.trim()) {
            userContent.push({ type: 'text', text: (block as any).text });
          } else if (block.type === 'image') {
            const src = (block as any).source;
            if (src?.type === 'base64' && src?.data) {
              userContent.push({
                type: 'image',
                image: src.data,
                mimeType: src.media_type,
              });
            }
          }
        }
        if (userContent.length > 0) {
          result.push({ role: 'user', content: userContent } as any);
        }
      }
    } else if (msg.role === 'assistant') {
      const assistantContent: any[] = [];
      for (const block of blocks) {
        if (block.type === 'text' && (block as any).text?.trim()) {
          assistantContent.push({ type: 'text', text: (block as any).text });
        } else if (block.type === 'tool_use') {
          const toolCallId = (block as any).id;
          const toolName = (block as any).name;
          const thoughtSig = (block as any).thoughtSignature;
          // Track for later tool_result matching
          toolCallNames.set(toolCallId, toolName);
          const toolCallPart: any = {
            type: 'tool-call',
            toolCallId,
            toolName,
            input: (block as any).input || {},
          };
          // Preserve thoughtSignature for Gemini 3 round-trips
          if (thoughtSig) {
            toolCallPart.providerOptions = {
              google: { thoughtSignature: thoughtSig },
            };
          }
          assistantContent.push(toolCallPart);
        }
      }
      if (assistantContent.length > 0) {
        result.push({ role: 'assistant', content: assistantContent } as any);
      }
    }
  }

  return result;
}

/**
 * Convert our ToolDefinition[] to Vercel's tools format (jsonSchema, no execute).
 * The agent loop handles execution externally.
 */
function convertTools(tools: ToolDefinition[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const tool of tools) {
    result[tool.name] = {
      description: tool.description,
      inputSchema: jsonSchema({
        type: 'object',
        properties: tool.input_schema.properties || {},
        required: tool.input_schema.required || [],
      }),
    };
  }
  return result;
}

// ── Thinking Configuration ──────────────────────────────────────────────────

function getProviderOptions(modelName: string, thinkingLevel: string | null): Record<string, any> | undefined {
  const entry = MODEL_REGISTRY[modelName];
  if (!entry || !thinkingLevel || thinkingLevel === 'none') return undefined;

  if (entry.provider === 'anthropic') {
    const budgetMap: Record<string, number> = {
      minimal: 1024, low: 2048, medium: 4096, high: 8192,
    };
    return {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: budgetMap[thinkingLevel] || 2048 },
      },
    };
  }

  if (entry.provider === 'google') {
    const budgetMap: Record<string, number> = {
      minimal: 128, low: 1024, medium: 4096, high: 8192,
    };
    return {
      google: {
        thinkingConfig: {
          thinkingBudget: budgetMap[thinkingLevel] || 1024,
        },
      },
    };
  }

  return undefined;
}

// ── Streaming Chat ──────────────────────────────────────────────────────────

/**
 * Stream chat using Vercel AI SDK. Produces the same StreamChunk events
 * as ai-provider.service.ts for backward compatibility with agent-loop.
 *
 * Uses maxSteps=1 so the LLM generates tool calls but we don't auto-execute.
 * The agent loop handles tool execution externally.
 */
export async function* vercelChatStream(
  modelName: string,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  systemPrompt?: string,
  options?: { temperature?: number; maxTokens?: number; thinkingLevel?: string | null; abortSignal?: AbortSignal }
): AsyncGenerator<StreamChunk> {
  const model = getVercelModel(modelName);
  const entry = MODEL_REGISTRY[modelName];
  const coreMessages = convertMessages(messages);

  const maxTokens = options?.maxTokens || entry?.maxTokens || 8192;
  let providerOptions = getProviderOptions(modelName, options?.thinkingLevel || null);

  // Build Vercel tools (no execute — agent loop handles execution)
  const vercelTools = tools ? convertTools(tools) : undefined;

  // Gemini 3.x thinking with tools: thoughtSignature is now captured from
  // tool-call events and preserved through the agent loop round-trip.
  // No need to disable thinking — it flows correctly through convertMessages.

  log.info(`[VercelAI] Starting stream with ${entry?.provider}/${entry?.modelId}, ${coreMessages.length} messages`);

  // Debug: log message structure to find validation issues
  for (let i = 0; i < coreMessages.length; i++) {
    const m = coreMessages[i] as any;
    const contentSummary = typeof m.content === 'string'
      ? `string(${m.content.length})`
      : Array.isArray(m.content)
        ? `[${m.content.map((c: any) => c.type).join(',')}]`
        : typeof m.content;
    log.info(`[VercelAI] msg[${i}] role=${m.role} content=${contentSummary}`);
  }

  // Don't pass temperature when Anthropic thinking is enabled (SDK warning + potential stall)
  const isAnthropicThinking = entry?.provider === 'anthropic' && providerOptions;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: coreMessages,
    tools: vercelTools,
    // No stopWhen / no execute on tools = single step only.
    // The agent loop handles iteration externally.
    maxOutputTokens: maxTokens,
    ...(isAnthropicThinking ? {} : { temperature: options?.temperature ?? 0.7 }),
    providerOptions: providerOptions as any,
    abortSignal: options?.abortSignal,
  });

  let fullText = '';
  const toolCalls: ToolCall[] = [];
  let isInThinking = false;

  try {
    let partCount = 0;
    const streamStartTime = Date.now();
    for await (const part of result.fullStream) {
      partCount++;
      if (partCount === 1) {
        log.info(`[VercelAI] First part received after ${Date.now() - streamStartTime}ms, type: ${part.type}`);
      }
      switch (part.type) {
        case 'text-delta': {
          fullText += part.text;
          yield { type: 'text', text: part.text };
          break;
        }

        case 'reasoning-start': {
          isInThinking = true;
          yield { type: 'thinking_start' };
          break;
        }

        case 'reasoning-delta': {
          yield { type: 'thinking', text: part.text || '' };
          break;
        }

        case 'reasoning-end': {
          isInThinking = false;
          yield { type: 'thinking_end' };
          break;
        }

        case 'tool-call': {
          // Close thinking if active
          if (isInThinking) {
            isInThinking = false;
            yield { type: 'thinking_end' };
          }

          // Capture thoughtSignature from Gemini provider metadata (needed for round-trips)
          const providerMeta = (part as any).providerMetadata || (part as any).providerOptions;
          const thoughtSig = providerMeta?.google?.thoughtSignature as string | undefined;

          const toolCall: ToolCall = {
            id: (part as any).toolCallId,
            name: (part as any).toolName,
            input: (part as any).input || (part as any).args || {},
            ...(thoughtSig ? { thoughtSignature: thoughtSig } : {}),
          };
          toolCalls.push(toolCall);

          // Emit tool_start and tool_use (for streaming compatibility)
          yield { type: 'tool_start', id: toolCall.id, name: toolCall.name };
          yield {
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.input,
            ...(thoughtSig ? { thoughtSignature: thoughtSig } : {}),
          };
          break;
        }

        case 'finish-step':
        case 'finish': {
          // Close thinking if still active
          if (isInThinking) {
            isInThinking = false;
            yield { type: 'thinking_end' };
          }

          const partUsage = (part as any).usage || (part as any).totalUsage;
          if (part.type === 'finish') {
            log.info(`[VercelAI] Stream finished: ${partCount} parts, ${Date.now() - streamStartTime}ms, in=${partUsage?.inputTokens || 0} out=${partUsage?.outputTokens || 0}, toolCalls: ${toolCalls.length}`);
          }
          // Vercel AI SDK uses inputTokens/outputTokens (not promptTokens/completionTokens)
          const usage: UsageInfo = {
            inputTokens: partUsage?.inputTokens || 0,
            outputTokens: partUsage?.outputTokens || 0,
          };

          // Detect cached tokens from inputTokenDetails or provider metadata
          const inputDetails = partUsage?.inputTokenDetails;
          if (inputDetails) {
            usage.cacheReadTokens = inputDetails.cacheReadTokens || 0;
            usage.cacheCreationTokens = inputDetails.cacheWriteTokens || 0;
          }
          // Fallback: Anthropic provider metadata
          const metadata = (part as any).providerMetadata;
          if (metadata?.anthropic && !usage.cacheReadTokens) {
            usage.cacheReadTokens = metadata.anthropic.cacheReadInputTokens || 0;
            usage.cacheCreationTokens = metadata.anthropic.cacheCreationInputTokens || 0;
          }

          const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';

          // Only emit 'done' once (on 'finish', not 'finish-step')
          if (part.type === 'finish') {
            yield {
              type: 'done',
              fullText,
              toolCalls,
              stopReason,
              usage,
            };
          }
          break;
        }

        case 'error': {
          throw new Error(String((part as any).error || 'Stream error'));
        }

        default:
          // Yield a heartbeat on 'start' so the agent loop knows the API is connected
          if (part.type === 'start') {
            yield { type: 'stream_connected' } as any;
          }
          break;
      }
    }
  } catch (error: any) {
    if (isInThinking) {
      yield { type: 'thinking_end' };
    }
    throw error;
  }
}

// ── Simple Chat (for summarization/extraction) ──────────────────────────────

/**
 * Non-streaming chat for internal use (context compaction, web_fetch extraction).
 * Uses Haiku for minimal cost.
 */
export async function vercelChatSimple(
  messages: ChatMessage[],
  systemPrompt?: string
): Promise<string> {
  if (!anthropicProvider) throw new Error('Anthropic API key not configured');

  const coreMessages = convertMessages(messages);

  const result = await generateText({
    model: anthropicProvider('claude-haiku-4-5-20251001'),
    system: systemPrompt,
    messages: coreMessages,
    maxOutputTokens: 4096,
  });

  return result.text || '';
}

// ── Structured Output ────────────────────────────────────────────────────────

/**
 * Generate a structured JSON object matching a Zod schema.
 * Uses Haiku for minimal cost.
 */
export async function vercelGenerateObject<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  systemPrompt?: string,
): Promise<T> {
  if (!anthropicProvider) throw new Error('Anthropic API key not configured');
  const coreMessages = convertMessages(messages);
  const result = await generateObject({
    model: anthropicProvider('claude-haiku-4-5-20251001'),
    schema,
    system: systemPrompt,
    messages: coreMessages,
  });
  return result.object;
}

// ── Context Window ──────────────────────────────────────────────────────────

export function getContextWindowTokens(modelName: string): number {
  return MODEL_REGISTRY[modelName]?.contextWindowTokens || 128000;
}

// ── Exports ─────────────────────────────────────────────────────────────────

export { MODEL_REGISTRY, z };
