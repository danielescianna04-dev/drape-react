/**
 * Gemini AI Provider
 * Integration with Google's Gemini API
 */

const BaseAIProvider = require('./base');
const { AI_KEYS } = require('../../utils/constants');

class GeminiProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'gemini';
        this.supportsTools = true;
        this.supportsStreaming = true;
        this.client = null;
    }

    async initialize() {
        if (!this.isAvailable()) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this.client = new GoogleGenerativeAI(AI_KEYS.GEMINI);
        return true;
    }

    isAvailable() {
        return !!AI_KEYS.GEMINI;
    }

    getModel(modelId) {
        if (!this.client) {
            throw new Error('Provider not initialized. Call initialize() first.');
        }

        // Safety settings to reduce false positives (especially for non-English languages)
        const safetySettings = [
            {
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: 'BLOCK_ONLY_HIGH'
            },
            {
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: 'BLOCK_ONLY_HIGH'
            },
            {
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: 'BLOCK_ONLY_HIGH'
            },
            {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: 'BLOCK_ONLY_HIGH'
            }
        ];

        return this.client.getGenerativeModel({
            model: modelId,
            safetySettings
        });
    }

    formatTools(tools) {
        return {
            functionDeclarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema || t.parameters
            }))
        };
    }

    formatMessages(messages) {
        const history = [];
        let systemInstruction = '';

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemInstruction = msg.content;
                continue;
            }

            if (msg.role === 'user') {
                if (Array.isArray(msg.content)) {
                    // Handle tool results
                    const toolResults = msg.content.filter(c => c.type === 'tool_result');
                    if (toolResults.length > 0) {
                        const parts = toolResults.map(tr => {
                            // Keep the original tool name to match model's expectations exactly
                            const toolName = tr.tool || 'unknown_tool';
                            return {
                                functionResponse: {
                                    name: toolName,
                                    response: { result: tr.content }
                                }
                            };
                        });
                        // Use 'user' role for function responses in modern Gemini SDK,
                        // but the parts contain functionResponse. Some SDK versions prefer 'function'.
                        // We'll use 'function' as it's the most explicit for the wire format.
                        history.push({ role: 'function', parts });
                        continue;
                    }

                    // Handle multimodal content (text + images)
                    const parts = [];
                    let imageCount = 0;
                    for (const item of msg.content) {
                        if (item.type === 'text') {
                            parts.push({ text: item.text });
                        } else if (item.type === 'image') {
                            // Convert Anthropic format to Gemini format
                            const base64Data = item.source?.data;
                            if (base64Data) {
                                imageCount++;
                                console.log(`[Gemini] Adding image ${imageCount}, base64 length: ${base64Data.length}, format: ${item.source?.media_type}`);
                                parts.push({
                                    inlineData: {
                                        mimeType: item.source?.media_type || 'image/jpeg',
                                        data: base64Data
                                    }
                                });
                            }
                        }
                    }
                    if (parts.length > 0) {
                        console.log(`[Gemini] Formatted multimodal message with ${parts.length} parts (${imageCount} images)`);
                        history.push({ role: 'user', parts });
                        continue;
                    }
                }
                history.push({
                    role: 'user',
                    parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }]
                });
            } else if (msg.role === 'assistant') {
                const parts = [];

                if (Array.isArray(msg.content)) {
                    const text = msg.content.find(c => c.type === 'text');
                    if (text) parts.push({ text: text.text });

                    const toolUses = msg.content.filter(c => c.type === 'tool_use');
                    toolUses.forEach(tu => {
                        const part = {
                            functionCall: {
                                name: tu.name,
                                args: tu.input
                            }
                        };

                        // Critical: thoughtSignature MUST be at the Part level, not inside functionCall
                        if (tu.thoughtSignature) {
                            part.thoughtSignature = tu.thoughtSignature;
                        }

                        parts.push(part);
                    });
                } else {
                    parts.push({ text: msg.content });
                }

                history.push({ role: 'model', parts });
            }
        }

        return { history, systemInstruction };
    }

    async chat(messages, options = {}) {
        const model = this.getModel(options.model || 'gemini-2.0-flash-exp');
        const { history, systemInstruction } = this.formatMessages(messages);

        const generationConfig = {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens || 8192
        };

        const config = {
            generationConfig,
            ...(systemInstruction && {
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                }
            })
        };

        if (options.tools && options.tools.length > 0) {
            config.tools = [this.formatTools(options.tools)];
        }

        const chat = model.startChat({
            ...config,
            history: history.slice(0, -1) // Exclude last message
        });

        const lastMessage = history[history.length - 1];
        const result = await chat.sendMessage(lastMessage?.parts || [{ text: '' }]);

        return {
            text: result.response.text(),
            toolCalls: this.parseToolCalls(result),
            usage: this.getUsage(result)
        };
    }

    async *chatStream(messages, options = {}) {
        const model = this.getModel(options.model || 'gemini-2.0-flash-exp');
        const { history, systemInstruction } = this.formatMessages(messages);

        const generationConfig = {
            temperature: options.temperature || 0.7,
            maxOutputTokens: options.maxTokens || 8192,
            // Enable thinking mode for Gemini models that support it
            ...(options.model?.includes('thinking') && {
                thinkingMode: 'enabled',
                responseModalities: ['TEXT', 'THINKING']
            })
        };

        const config = {
            generationConfig,
            ...(systemInstruction && {
                systemInstruction: {
                    parts: [{ text: systemInstruction }]
                }
            })
        };

        if (options.tools && options.tools.length > 0) {
            config.tools = [this.formatTools(options.tools)];
        }

        const chat = model.startChat({
            ...config,
            history: history.slice(0, -1)
        });

        const lastMessage = history[history.length - 1];
        const result = await chat.sendMessageStream(lastMessage?.parts || [{ text: '' }]);

        let fullText = '';
        let toolCalls = [];
        let hasStartedThinking = false;
        let thinkingContent = '';

        for await (const chunk of result.stream) {
            // DEBUG: Log entire chunk structure to see what Gemini sends
            if (process.env.DEBUG_GEMINI_THINKING) {
                console.log('[Gemini Debug] Chunk:', JSON.stringify(chunk, null, 2));
            }

            // Check for thinking/reasoning metadata
            const candidate = chunk.candidates?.[0];

            // CRITICAL: Check for modelVersion or thinking indicators
            if (candidate) {
                // Log candidate structure for debugging
                if (process.env.DEBUG_GEMINI_THINKING && candidate.content) {
                    console.log('[Gemini Debug] Candidate content:', JSON.stringify(candidate.content, null, 2));
                }

                // Check for thoughts in various possible locations
                const thoughts = candidate.thought ||
                                candidate.thoughts ||
                                candidate.thinking ||
                                candidate.content?.thought ||
                                candidate.content?.thoughts;

                if (thoughts) {
                    if (!hasStartedThinking) {
                        hasStartedThinking = true;
                        yield { type: 'thinking_start' };
                    }
                    const thinkText = typeof thoughts === 'string' ? thoughts : JSON.stringify(thoughts);
                    thinkingContent += thinkText;
                    yield { type: 'thinking', text: thinkText };
                }
            }

            // Gemini 2.0 thinking mode: extract thoughts from grounding metadata or special parts
            if (candidate?.groundingMetadata?.webSearchQueries || candidate?.groundingMetadata?.retrievalQueries) {
                if (!hasStartedThinking) {
                    hasStartedThinking = true;
                    yield { type: 'thinking_start' };
                }
                const queries = candidate.groundingMetadata.webSearchQueries || candidate.groundingMetadata.retrievalQueries;
                if (queries && queries.length > 0) {
                    const thinkText = `Searching: ${queries.join(', ')}`;
                    thinkingContent += thinkText + '\n';
                    yield { type: 'thinking', text: thinkText };
                }
            }

            // Check for thought parts in content.parts
            if (candidate?.content?.parts) {
                for (const part of candidate.content.parts) {
                    // Check multiple possible field names for thoughts
                    const thoughtText = part.thought ||
                                       part.thoughts ||
                                       part.thinking ||
                                       part.thinkingProcess ||
                                       part.reasoning;

                    if (thoughtText) {
                        if (!hasStartedThinking) {
                            hasStartedThinking = true;
                            yield { type: 'thinking_start' };
                        }
                        const thinkText = typeof thoughtText === 'string' ? thoughtText : JSON.stringify(thoughtText);
                        thinkingContent += thinkText;
                        yield { type: 'thinking', text: thinkText };

                        console.log('[Gemini] Captured thinking:', thinkText.substring(0, 100));
                    }
                }
            }

            const text = chunk.text();
            if (text) {
                if (hasStartedThinking && thinkingContent) {
                    yield { type: 'thinking_end' };
                    hasStartedThinking = false;
                }
                fullText += text;
                yield { type: 'text', text };
            }

            if (chunk.candidates?.[0]?.content?.parts) {
                for (const part of chunk.candidates[0].content.parts) {
                    if (part.functionCall) {
                        const toolCall = {
                            id: `call_${Math.random().toString(36).substr(2, 9)}`,
                            name: part.functionCall.name,
                            input: part.functionCall.args,
                            // Capture signature - it might be at the part level or nested in functionCall
                            thoughtSignature: part.thoughtSignature ||
                                part.thought_signature ||
                                part.functionCall.thought_signature ||
                                part.functionCall.thoughtSignature
                        };
                        toolCalls.push(toolCall);
                        yield {
                            type: 'tool_use',
                            ...toolCall
                        };
                    }
                }
            }
        }

        // End thinking if it was started but never ended
        if (hasStartedThinking) {
            yield { type: 'thinking_end' };
        }

        yield { type: 'done', fullText, toolCalls };
    }

    parseToolCalls(result) {
        const toolCalls = [];
        const response = result.response;

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.functionCall) {
                    toolCalls.push({
                        id: `call_${Math.random().toString(36).substr(2, 9)}`,
                        name: part.functionCall.name,
                        input: part.functionCall.args,
                        thoughtSignature: part.thoughtSignature ||
                            part.thought_signature ||
                            part.functionCall.thought_signature ||
                            part.functionCall.thoughtSignature
                    });
                }
            }
        }

        return toolCalls;
    }

    getUsage(result) {
        const metadata = result.response?.usageMetadata;
        return {
            inputTokens: metadata?.promptTokenCount || 0,
            outputTokens: metadata?.candidatesTokenCount || 0,
            cachedTokens: metadata?.cachedContentTokenCount || 0
        };
    }
    async embed(text) {
        if (!this.client) {
            await this.initialize();
        }

        const model = this.client.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await model.embedContent(text);
        return result.embedding.values;
    }
}

module.exports = GeminiProvider;
