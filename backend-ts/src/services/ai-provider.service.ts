import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { config } from '../config';
import { log } from '../utils/logger';

// Type definitions
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: ContentBlock[] | string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; media_type?: string; data?: string; url?: string } }
  | { type: 'tool_use'; id: string; name: string; input: any; thoughtSignature?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string; thoughtSignature?: string };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
  thoughtSignature?: string; // Gemini 3 thought signature for tool calls
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'thinking_start' }
  | { type: 'thinking'; text: string }
  | { type: 'thinking_end' }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_use'; id: string; name: string; input: any; thoughtSignature?: string }
  | { type: 'done'; fullText: string; toolCalls: ToolCall[]; stopReason: string; usage: UsageInfo };

export interface ModelConfig {
  provider: 'anthropic' | 'gemini' | 'groq';
  modelId: string;
  maxTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsImages: boolean;
  costPerMInputToken: number;
  costPerMOutputToken: number;
}

/**
 * Multi-provider AI service supporting Claude (Anthropic), Gemini (Google), and Groq
 */
class AIProviderService {
  private static instance: AIProviderService;
  private anthropicClient: Anthropic | null = null;
  private geminiClient: GoogleGenerativeAI | null = null;
  private geminiGenAI: GoogleGenAI | null = null; // New SDK for Gemini 3 with thinking
  private groqClient: Groq | null = null;

  private readonly modelRegistry: Record<string, ModelConfig> = {
    'claude-sonnet-4': {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 3.0,
      costPerMOutputToken: 15.0,
    },
    'claude-4-5-sonnet': {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 3.0,
      costPerMOutputToken: 15.0,
    },
    'claude-4-5-opus': {
      provider: 'anthropic',
      modelId: 'claude-opus-4-20250514',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 15.0,
      costPerMOutputToken: 75.0,
    },
    'claude-haiku-3.5': {
      provider: 'anthropic',
      modelId: 'claude-3-5-haiku-20241022',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 0.8,
      costPerMOutputToken: 4.0,
    },
    'gemini-3-flash': {
      provider: 'gemini',
      modelId: 'gemini-3-flash-preview',
      maxTokens: 65536, // Gemini 3 supports up to 1M context
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 0.5,
      costPerMOutputToken: 3.0,
    },
    'gemini-3-pro': {
      provider: 'gemini',
      modelId: 'gemini-3-pro-preview',
      maxTokens: 65536, // Gemini 3 supports up to 1M context
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 1.25,
      costPerMOutputToken: 10.0,
    },
    'llama-3.3-70b': {
      provider: 'groq',
      modelId: 'llama-3.3-70b-versatile',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: false,
      costPerMInputToken: 0.59,
      costPerMOutputToken: 0.79,
    },
  };

  private constructor() {
    this.initializeClients();
  }

  public static getInstance(): AIProviderService {
    if (!AIProviderService.instance) {
      AIProviderService.instance = new AIProviderService();
    }
    return AIProviderService.instance;
  }

  private initializeClients(): void {
    try {
      if (config.anthropicApiKey) {
        this.anthropicClient = new Anthropic({
          apiKey: config.anthropicApiKey,
        });
        log.info('Anthropic client initialized');
      }

      if (config.geminiApiKey) {
        this.geminiClient = new GoogleGenerativeAI(config.geminiApiKey);
        // New SDK for Gemini 3 with thinking support
        this.geminiGenAI = new GoogleGenAI({ apiKey: config.geminiApiKey });
        log.info('Gemini clients initialized (legacy + GenAI with thinking)');
      }

      if (config.groqApiKey) {
        this.groqClient = new Groq({
          apiKey: config.groqApiKey,
        });
        log.info('Groq client initialized');
      }
    } catch (error) {
      log.error('Failed to initialize AI clients:', error);
    }
  }

  public getModels(): Record<string, ModelConfig> {
    return { ...this.modelRegistry };
  }

  public getModelConfig(modelName: string): ModelConfig | null {
    return this.modelRegistry[modelName] || null;
  }

  /**
   * Main streaming chat method that routes to appropriate provider
   */
  public async *chatStream(
    model: string,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number; thinkingLevel?: string | null }
  ): AsyncGenerator<StreamChunk> {
    const modelConfig = this.getModelConfig(model);
    if (!modelConfig) {
      throw new Error(`Unknown model: ${model}`);
    }

    log.info(`Starting chat stream with ${modelConfig.provider}/${modelConfig.modelId}`);

    switch (modelConfig.provider) {
      case 'anthropic':
        yield* this.claudeStream(modelConfig, messages, tools, systemPrompt, options);
        break;
      case 'gemini':
        yield* this.geminiStream(modelConfig, messages, tools, systemPrompt, options);
        break;
      case 'groq':
        yield* this.groqStream(modelConfig, messages, tools, systemPrompt, options);
        break;
      default:
        throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }
  }

  /**
   * Claude (Anthropic) streaming implementation
   */
  private async *claudeStream(
    modelConfig: ModelConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncGenerator<StreamChunk> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized. Check API key configuration.');
    }

    try {
      const formattedMessages = this.formatMessagesForProvider(messages, 'anthropic');
      const systemMessages = this.extractSystemPrompt(messages, systemPrompt);

      const requestParams: any = {
        model: modelConfig.modelId,
        max_tokens: options?.maxTokens || modelConfig.maxTokens,
        messages: formattedMessages,
        stream: true,
      };

      if (systemMessages) {
        // Apply prompt caching to system prompt
        requestParams.system = [
          {
            type: 'text',
            text: systemMessages,
            cache_control: { type: 'ephemeral' },
          },
        ];
      }

      if (tools && tools.length > 0) {
        requestParams.tools = this.formatToolsForProvider(tools, 'anthropic');
      }

      if (options?.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }

      const stream = await this.anthropicClient.messages.stream(requestParams);

      let fullText = '';
      const toolCalls: ToolCall[] = [];
      let currentToolId = '';
      let currentToolName = '';
      let currentToolInput = '';
      let inThinking = false;
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 };

      for await (const event of stream) {
        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'text') {
              // Regular text block
              if (event.content_block.text) {
                fullText += event.content_block.text;
                yield { type: 'text', text: event.content_block.text };
              }
            } else if (event.content_block.type === 'thinking') {
              // Claude thinking/reasoning block
              inThinking = true;
              yield { type: 'thinking_start' };
              if (event.content_block.thinking) {
                yield { type: 'thinking', text: event.content_block.thinking };
              }
            } else if (event.content_block.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = '';
              yield { type: 'tool_start', id: currentToolId, name: currentToolName };
            }
            break;

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              const text = event.delta.text;
              if (inThinking) {
                yield { type: 'thinking', text };
              } else {
                fullText += text;
                yield { type: 'text', text };
              }
            } else if (event.delta.type === 'thinking_delta') {
              yield { type: 'thinking', text: event.delta.thinking };
            } else if (event.delta.type === 'input_json_delta') {
              currentToolInput += event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (inThinking) {
              inThinking = false;
              yield { type: 'thinking_end' };
            } else if (currentToolId) {
              try {
                const parsedInput = JSON.parse(currentToolInput);
                toolCalls.push({
                  id: currentToolId,
                  name: currentToolName,
                  input: parsedInput,
                });
                yield {
                  type: 'tool_use',
                  id: currentToolId,
                  name: currentToolName,
                  input: parsedInput,
                };
              } catch (error) {
                log.error('Failed to parse tool input:', error);
              }
              currentToolId = '';
              currentToolName = '';
              currentToolInput = '';
            }
            break;

          case 'message_delta':
            if (event.usage) {
              usage.outputTokens = event.usage.output_tokens || 0;
            }
            break;

          case 'message_start':
            if (event.message?.usage) {
              usage.inputTokens = event.message.usage.input_tokens || 0;
              usage.cacheReadTokens = event.message.usage.cache_read_input_tokens ?? undefined;
              usage.cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? undefined;
            }
            break;

          case 'message_stop':
            // Stream complete
            break;
        }
      }

      const finalMessage = await stream.finalMessage();
      yield {
        type: 'done',
        fullText,
        toolCalls,
        stopReason: finalMessage.stop_reason || 'end_turn',
        usage,
      };
    } catch (error) {
      log.error('Claude streaming error:', error);
      throw error;
    }
  }

  /**
   * Gemini streaming implementation
   * Uses new @google/genai SDK for Gemini 3 with thinking support
   */
  private async *geminiStream(
    modelConfig: ModelConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number; thinkingLevel?: string | null }
  ): AsyncGenerator<StreamChunk> {
    // Check if this is a Gemini 3 model (supports native thinking via new SDK)
    const isGemini3 = modelConfig.modelId.includes('gemini-3');

    // Use new SDK for Gemini 3 with thinking, fall back to legacy for older models
    if (isGemini3 && this.geminiGenAI) {
      yield* this.gemini3StreamWithThinking(modelConfig, messages, tools, systemPrompt, options);
      return;
    }

    // Legacy implementation for non-Gemini-3 models
    if (!this.geminiClient) {
      throw new Error('Gemini client not initialized. Check API key configuration.');
    }

    try {
      const model = this.geminiClient.getGenerativeModel({
        model: modelConfig.modelId,
        systemInstruction: this.extractSystemPrompt(messages, systemPrompt),
      });

      const formattedMessages = this.formatMessagesForProvider(messages, 'gemini');

      const generationConfig: any = {
        maxOutputTokens: options?.maxTokens || modelConfig.maxTokens,
      };

      if (options?.temperature !== undefined) {
        generationConfig.temperature = options.temperature;
      }

      // Build safety settings
      const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ];

      if ((HarmCategory as any).HARM_CATEGORY_CIVIC_INTEGRITY) {
        safetySettings.push({
          category: (HarmCategory as any).HARM_CATEGORY_CIVIC_INTEGRITY,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        });
      }

      const requestParams: any = {
        contents: formattedMessages,
        generationConfig,
        safetySettings,
      };

      if (tools && tools.length > 0) {
        requestParams.tools = [{ functionDeclarations: this.formatToolsForProvider(tools, 'gemini') }];
      }

      const streamingResult = await model.generateContentStream(requestParams);

      let fullText = '';
      const toolCalls: ToolCall[] = [];
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 };

      for await (const chunk of streamingResult.stream) {
        const candidate = chunk.candidates?.[0];
        if (!candidate) continue;

        const content = candidate.content;
        if (!content?.parts) continue;

        for (const part of content.parts) {
          if (part.text !== undefined && part.text !== null && part.text !== '') {
            fullText += part.text;
            yield { type: 'text', text: part.text };
          }

          if ((part as any).functionCall) {
            const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const toolName = (part as any).functionCall.name;
            const toolInput = (part as any).functionCall.args;

            yield { type: 'tool_start', id: toolId, name: toolName };
            yield { type: 'tool_use', id: toolId, name: toolName, input: toolInput };

            toolCalls.push({ id: toolId, name: toolName, input: toolInput });
          }
        }

        if (chunk.usageMetadata) {
          usage.inputTokens = chunk.usageMetadata.promptTokenCount || 0;
          usage.outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
        }
      }

      const response = await streamingResult.response;
      const finishReason = response.candidates?.[0]?.finishReason || 'STOP';

      yield { type: 'done', fullText, toolCalls, stopReason: finishReason, usage };
    } catch (error: any) {
      log.error('[Gemini Legacy] Streaming error:', error.message);
      throw new Error(`Errore Gemini: ${error.message?.substring(0, 100)}`);
    }
  }

  /**
   * Gemini 3 streaming with thinking support using new @google/genai SDK
   */
  private async *gemini3StreamWithThinking(
    modelConfig: ModelConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number; thinkingLevel?: string | null }
  ): AsyncGenerator<StreamChunk> {
    if (!this.geminiGenAI) {
      throw new Error('Gemini GenAI client not initialized.');
    }

    try {
      const isFlash = modelConfig.modelId.includes('flash');

      // Determine thinking level
      let thinkingLevel = options?.thinkingLevel || (isFlash ? 'medium' : 'low');
      const validFlashLevels = ['minimal', 'low', 'medium', 'high'];
      const validProLevels = ['low', 'high'];
      const validLevels = isFlash ? validFlashLevels : validProLevels;

      if (!validLevels.includes(thinkingLevel)) {
        thinkingLevel = isFlash ? 'medium' : 'low';
      }

      log.info(`[Gemini 3] Using new SDK with thinking (level: ${thinkingLevel}, includeThoughts: true)`);

      // Format contents for the new SDK
      const contents = this.formatContentsForGenAI(messages, systemPrompt);

      // Build config with thinking
      const config: any = {
        thinkingConfig: {
          thinkingLevel,
          includeThoughts: true,
        },
        maxOutputTokens: options?.maxTokens || 65536,
      };

      if (options?.temperature !== undefined) {
        config.temperature = options.temperature;
      }

      // Add tools if provided
      if (tools && tools.length > 0) {
        config.tools = [{
          functionDeclarations: tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          })),
        }];
      }

      // Use the new SDK's streaming method
      const response = await this.geminiGenAI.models.generateContentStream({
        model: modelConfig.modelId,
        contents,
        config,
      });

      let fullText = '';
      const toolCalls: ToolCall[] = [];
      let thinkingStarted = false;
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 };

      let chunkIndex = 0;
      for await (const chunk of response) {
        chunkIndex++;
        // Debug: Log raw chunk structure for first few chunks
        if (chunkIndex <= 3) {
          log.info(`[Gemini 3] Chunk ${chunkIndex} keys: ${Object.keys(chunk).join(', ')}`);
          const candidates = (chunk as any).candidates;
          if (candidates?.[0]) {
            const c = candidates[0];
            log.info(`[Gemini 3] Candidate keys: ${Object.keys(c).join(', ')}`);
            if (c.content) {
              log.info(`[Gemini 3] Content keys: ${Object.keys(c.content).join(', ')}`);
            }
            if (c.content?.parts) {
              const parts = c.content.parts;
              log.info(`[Gemini 3] Parts count: ${parts.length}`);
              for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                log.info(`[Gemini 3] Part ${i}: ${JSON.stringify(p).substring(0, 200)}`);
              }
            }
          }
        }

        // Handle candidates from the new SDK response format
        const candidates = (chunk as any).candidates;
        if (!candidates || candidates.length === 0) continue;

        const candidate = candidates[0];
        const content = candidate.content;
        if (!content?.parts) continue;

        for (const part of content.parts) {
          // Check for thinking part (thought: true indicates thinking content)
          if (part.thought === true && part.text) {
            if (!thinkingStarted) {
              thinkingStarted = true;
              yield { type: 'thinking_start' };
            }
            yield { type: 'thinking', text: part.text };
            log.info(`[Gemini 3] Thinking: ${part.text.substring(0, 80)}...`);
            continue;
          }

          // Handle regular text (not thinking)
          if (part.text !== undefined && part.text !== null && part.text !== '') {
            // End thinking phase when regular text starts
            if (thinkingStarted) {
              yield { type: 'thinking_end' };
              thinkingStarted = false;
            }
            fullText += part.text;
            yield { type: 'text', text: part.text };
          }

          // Handle function calls
          if (part.functionCall) {
            if (thinkingStarted) {
              yield { type: 'thinking_end' };
              thinkingStarted = false;
            }

            const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const toolName = part.functionCall.name;
            const toolInput = part.functionCall.args;
            const thoughtSignature = part.thoughtSignature;

            yield { type: 'tool_start', id: toolId, name: toolName };
            yield { type: 'tool_use', id: toolId, name: toolName, input: toolInput, thoughtSignature };

            toolCalls.push({ id: toolId, name: toolName, input: toolInput, thoughtSignature });
          }
        }

        // Extract usage from chunk
        const usageMetadata = (chunk as any).usageMetadata;
        if (usageMetadata) {
          usage.inputTokens = usageMetadata.promptTokenCount || 0;
          usage.outputTokens = usageMetadata.candidatesTokenCount || 0;
        }
      }

      // Ensure thinking is ended
      if (thinkingStarted) {
        yield { type: 'thinking_end' };
      }

      yield { type: 'done', fullText, toolCalls, stopReason: 'STOP', usage };
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      log.error('[Gemini 3] Streaming error:', errorMessage);

      if (errorMessage.includes('thinkingConfig') || errorMessage.includes('Unknown name')) {
        throw new Error('Errore configurazione thinking Gemini 3. Verifica la versione del SDK.');
      }

      throw new Error(`Errore Gemini 3: ${errorMessage.substring(0, 100)}`);
    }
  }

  /**
   * Format messages for the new @google/genai SDK
   */
  private formatContentsForGenAI(messages: ChatMessage[], systemPrompt?: string): any[] {
    const contents: any[] = [];

    // Add system prompt as first user message if provided
    const system = this.extractSystemPrompt(messages, systemPrompt);
    if (system) {
      contents.push({
        role: 'user',
        parts: [{ text: `System: ${system}` }],
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }],
      });
    }

    // Filter out system messages and format
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    for (const msg of nonSystemMessages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts: any[] = [];

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'image' && block.source.type === 'base64' && block.source.data) {
            parts.push({
              inlineData: {
                mimeType: block.source.media_type || 'image/jpeg',
                data: block.source.data,
              },
            });
          } else if (block.type === 'tool_use') {
            const part: any = {
              functionCall: { name: block.name, args: block.input },
            };
            // Include thoughtSignature at part level for Gemini 3 thinking
            if ((block as any).thoughtSignature) {
              part.thoughtSignature = (block as any).thoughtSignature;
            }
            parts.push(part);
          } else if (block.type === 'tool_result') {
            parts.push({
              functionResponse: { name: block.tool_use_id, response: { result: block.content } },
            });
          }
        }
      } else {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return contents;
  }

  /**
   * Groq streaming implementation
   */
  private async *groqStream(
    modelConfig: ModelConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncGenerator<StreamChunk> {
    if (!this.groqClient) {
      throw new Error('Groq client not initialized. Check API key configuration.');
    }

    try {
      const formattedMessages = this.formatMessagesForProvider(messages, 'groq');

      // Add system prompt if provided
      const systemMessage = this.extractSystemPrompt(messages, systemPrompt);
      if (systemMessage) {
        formattedMessages.unshift({
          role: 'system',
          content: systemMessage,
        });
      }

      const requestParams: any = {
        model: modelConfig.modelId,
        messages: formattedMessages,
        max_tokens: options?.maxTokens || modelConfig.maxTokens,
        stream: true,
      };

      if (tools && tools.length > 0) {
        requestParams.tools = this.formatToolsForProvider(tools, 'groq');
      }

      if (options?.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }

      const stream = await this.groqClient.chat.completions.create(requestParams) as any;

      let fullText = '';
      const toolCalls: ToolCall[] = [];
      let currentToolCall: any = null;
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 };

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // Handle text content
        if (delta.content) {
          fullText += delta.content;
          yield { type: 'text', text: delta.content };
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.function) {
              if (!currentToolCall || currentToolCall.index !== toolCall.index) {
                // New tool call starting
                currentToolCall = {
                  index: toolCall.index,
                  id: toolCall.id || `tool_${Date.now()}_${toolCall.index}`,
                  name: toolCall.function.name || '',
                  arguments: toolCall.function.arguments || '',
                };

                if (currentToolCall.name) {
                  yield {
                    type: 'tool_start',
                    id: currentToolCall.id,
                    name: currentToolCall.name,
                  };
                }
              } else {
                // Continuation of current tool call
                if (toolCall.function.name) {
                  currentToolCall.name = toolCall.function.name;
                }
                if (toolCall.function.arguments) {
                  currentToolCall.arguments += toolCall.function.arguments;
                }
              }
            }
          }
        }

        // Check if we've finished a tool call
        const finishReason = chunk.choices?.[0]?.finish_reason;
        if (finishReason === 'tool_calls' && currentToolCall) {
          try {
            const parsedArgs = JSON.parse(currentToolCall.arguments);
            toolCalls.push({
              id: currentToolCall.id,
              name: currentToolCall.name,
              input: parsedArgs,
            });
            yield {
              type: 'tool_use',
              id: currentToolCall.id,
              name: currentToolCall.name,
              input: parsedArgs,
            };
          } catch (error) {
            log.error('Failed to parse Groq tool arguments:', error);
          }
          currentToolCall = null;
        }

        // Extract usage if available
        if (chunk.usage) {
          usage.inputTokens = chunk.usage.prompt_tokens || 0;
          usage.outputTokens = chunk.usage.completion_tokens || 0;
        }
      }

      yield {
        type: 'done',
        fullText,
        toolCalls,
        stopReason: 'stop',
        usage,
      };
    } catch (error) {
      log.error('Groq streaming error:', error);
      throw error;
    }
  }

  /**
   * Format tools according to provider requirements
   */
  private formatToolsForProvider(
    tools: ToolDefinition[],
    provider: 'anthropic' | 'gemini' | 'groq'
  ): any[] {
    switch (provider) {
      case 'anthropic':
        // Claude format is already compatible
        return tools;

      case 'gemini':
        // Convert to Gemini function declaration format
        return tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        }));

      case 'groq':
        // Convert to OpenAI-compatible format
        return tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        }));

      default:
        return tools;
    }
  }

  /**
   * Format messages according to provider requirements
   */
  private formatMessagesForProvider(
    messages: ChatMessage[],
    provider: 'anthropic' | 'gemini' | 'groq'
  ): any[] {
    // Filter out system messages - they're handled separately
    const nonSystemMessages = messages.filter((msg) => msg.role !== 'system');

    switch (provider) {
      case 'anthropic':
        return nonSystemMessages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }],
        }));

      case 'gemini':
        // Build maps of tool_use_id -> function_name and tool_use_id -> thoughtSignature
        const toolIdToName: Record<string, string> = {};
        const toolIdToSignature: Record<string, string> = {};
        for (const msg of nonSystemMessages) {
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'tool_use') {
                toolIdToName[block.id] = block.name;
                if (block.thoughtSignature) {
                  toolIdToSignature[block.id] = block.thoughtSignature;
                }
              }
            }
          }
        }

        return nonSystemMessages.map((msg) => {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          const parts: any[] = [];

          if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === 'text') {
                parts.push({ text: block.text });
              } else if (block.type === 'image') {
                if (block.source.type === 'base64' && block.source.data) {
                  parts.push({
                    inlineData: {
                      mimeType: block.source.media_type || 'image/jpeg',
                      data: block.source.data,
                    },
                  });
                } else if (block.source.type === 'url' && block.source.url) {
                  // Gemini doesn't support URL images directly in the same way
                  // You'd need to fetch and convert to base64
                  parts.push({ text: `[Image: ${block.source.url}]` });
                }
              } else if (block.type === 'tool_use') {
                // Include thoughtSignature for Gemini 3 if present
                const functionCallPart: any = {
                  functionCall: {
                    name: block.name,
                    args: block.input,
                  },
                };
                if (block.thoughtSignature) {
                  functionCallPart.thoughtSignature = block.thoughtSignature;
                }
                parts.push(functionCallPart);
              } else if (block.type === 'tool_result') {
                // Use the function name and thoughtSignature from our maps
                const functionName = toolIdToName[block.tool_use_id] || block.tool_use_id;
                const thoughtSignature = block.thoughtSignature || toolIdToSignature[block.tool_use_id];

                const functionResponsePart: any = {
                  functionResponse: {
                    name: functionName,
                    response: { result: block.content },
                  },
                };
                // Include thoughtSignature for Gemini 3 if present
                if (thoughtSignature) {
                  functionResponsePart.thoughtSignature = thoughtSignature;
                }
                parts.push(functionResponsePart);
              }
            }
          } else {
            parts.push({ text: msg.content });
          }

          return { role, parts };
        });

      case 'groq':
        return nonSystemMessages.map((msg) => {
          let content: string;

          if (Array.isArray(msg.content)) {
            // Groq doesn't support multimodal, extract text only
            content = msg.content
              .filter((block) => block.type === 'text')
              .map((block) => (block as any).text)
              .join('\n');
          } else {
            content = msg.content;
          }

          return {
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content,
          };
        });

      default:
        return nonSystemMessages;
    }
  }

  /**
   * Extract system prompt from messages or use provided one
   */
  private extractSystemPrompt(messages: ChatMessage[], providedSystemPrompt?: string): string {
    const systemMessages = messages
      .filter((msg) => msg.role === 'system')
      .map((msg) => (typeof msg.content === 'string' ? msg.content : ''))
      .join('\n\n');

    if (providedSystemPrompt && systemMessages) {
      return `${providedSystemPrompt}\n\n${systemMessages}`;
    }

    return providedSystemPrompt || systemMessages;
  }
}

// Export singleton instance
export const aiProviderService = AIProviderService.getInstance();
