import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
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
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string };

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
  | { type: 'tool_use'; id: string; name: string; input: any }
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
    'gemini-2.5-flash': {
      provider: 'gemini',
      modelId: 'gemini-2.5-flash',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 0.075,
      costPerMOutputToken: 0.3,
    },
    'gemini-3-flash': {
      provider: 'gemini',
      modelId: 'gemini-2.5-flash',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 0.075,
      costPerMOutputToken: 0.3,
    },
    'gemini-2.5-pro': {
      provider: 'gemini',
      modelId: 'gemini-2.5-pro',
      maxTokens: 8192,
      supportsTools: true,
      supportsStreaming: true,
      supportsImages: true,
      costPerMInputToken: 1.25,
      costPerMOutputToken: 5.0,
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
        log.info('Gemini client initialized');
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
    options?: { temperature?: number; maxTokens?: number }
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
   */
  private async *geminiStream(
    modelConfig: ModelConfig,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
    systemPrompt?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): AsyncGenerator<StreamChunk> {
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

      const requestParams: any = {
        contents: formattedMessages,
        generationConfig,
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      };

      if (tools && tools.length > 0) {
        requestParams.tools = [
          {
            functionDeclarations: this.formatToolsForProvider(tools, 'gemini'),
          },
        ];
      }

      const streamingResult = await model.generateContentStream(requestParams);

      let fullText = '';
      const toolCalls: ToolCall[] = [];
      let inThinking = false;
      let usage: UsageInfo = { inputTokens: 0, outputTokens: 0 };

      for await (const chunk of streamingResult.stream) {
        const candidate = chunk.candidates?.[0];
        if (!candidate) continue;

        const content = candidate.content;
        if (!content?.parts) continue;

        for (const part of content.parts) {
          // Handle text content
          if (part.text) {
            // Check if this is thinking/reasoning content
            if (part.text.includes('<thinking>') || inThinking) {
              if (!inThinking) {
                inThinking = true;
                yield { type: 'thinking_start' };
              }

              const thinkingText = part.text.replace(/<\/?thinking>/g, '');
              if (thinkingText) {
                yield { type: 'thinking', text: thinkingText };
              }

              if (part.text.includes('</thinking>')) {
                inThinking = false;
                yield { type: 'thinking_end' };
              }
            } else {
              fullText += part.text;
              yield { type: 'text', text: part.text };
            }
          }

          // Handle function calls (tool use)
          if (part.functionCall) {
            const toolId = `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const toolName = part.functionCall.name;
            const toolInput = part.functionCall.args;

            yield { type: 'tool_start', id: toolId, name: toolName };
            yield { type: 'tool_use', id: toolId, name: toolName, input: toolInput };

            toolCalls.push({
              id: toolId,
              name: toolName,
              input: toolInput,
            });
          }
        }

        // Extract usage information
        if (chunk.usageMetadata) {
          usage.inputTokens = chunk.usageMetadata.promptTokenCount || 0;
          usage.outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
        }
      }

      const response = await streamingResult.response;
      const finishReason = response.candidates?.[0]?.finishReason || 'STOP';

      yield {
        type: 'done',
        fullText,
        toolCalls,
        stopReason: finishReason,
        usage,
      };
    } catch (error) {
      log.error('Gemini streaming error:', error);
      throw error;
    }
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
                parts.push({
                  functionCall: {
                    name: block.name,
                    args: block.input,
                  },
                });
              } else if (block.type === 'tool_result') {
                parts.push({
                  functionResponse: {
                    name: block.tool_use_id,
                    response: { result: block.content },
                  },
                });
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
