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
                        const parts = toolResults.map(tr => ({
                            functionResponse: {
                                name: tr.tool || 'unknown_tool',
                                response: { result: tr.content }
                            }
                        }));
                        history.push({ role: 'function', parts });
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
                        parts.push({
                            functionCall: {
                                name: tu.name,
                                args: tu.input
                            }
                        });
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
            history: history.slice(0, -1)
        });

        const lastMessage = history[history.length - 1];
        const result = await chat.sendMessageStream(lastMessage?.parts || [{ text: '' }]);

        let fullText = '';
        let toolCalls = [];

        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
                fullText += text;
                yield { type: 'text', text };
            }

            const calls = chunk.functionCalls();
            if (calls && calls.length > 0) {
                for (const call of calls) {
                    const toolCall = {
                        id: `call_${Math.random().toString(36).substr(2, 9)}`,
                        name: call.name,
                        input: call.args
                    };
                    toolCalls.push(toolCall);
                    yield { type: 'tool_call', toolCall };
                }
            }
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
                        input: part.functionCall.args
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
