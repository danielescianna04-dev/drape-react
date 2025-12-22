/**
 * Groq AI Provider
 * Integration with Groq's fast inference API
 */

const BaseAIProvider = require('./base');
const { AI_KEYS } = require('../../utils/constants');
const axios = require('axios');

class GroqProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'groq';
        this.supportsTools = true;
        this.supportsStreaming = true;
        this.baseUrl = 'https://api.groq.com/openai/v1';
    }

    async initialize() {
        if (!this.isAvailable()) {
            throw new Error('GROQ_API_KEY is not configured');
        }
        return true;
    }

    isAvailable() {
        return !!AI_KEYS.GROQ;
    }

    formatTools(tools) {
        return tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema || t.parameters
            }
        }));
    }

    formatMessages(messages) {
        return messages.map(msg => {
            if (msg.role === 'system') {
                return { role: 'system', content: msg.content };
            }

            if (msg.role === 'user') {
                if (Array.isArray(msg.content)) {
                    // Handle tool results
                    const results = msg.content.filter(c => c.type === 'tool_result');
                    if (results.length > 0) {
                        return results.map(res => ({
                            role: 'tool',
                            tool_call_id: res.tool_use_id || res.id,
                            content: res.content
                        }));
                    }
                    // Regular content
                    const text = msg.content.find(c => c.type === 'text')?.text;
                    return { role: 'user', content: text || '' };
                }
                return { role: 'user', content: msg.content };
            }

            if (msg.role === 'assistant') {
                if (Array.isArray(msg.content)) {
                    const text = msg.content.find(c => c.type === 'text')?.text || null;
                    const toolUses = msg.content.filter(c => c.type === 'tool_use');

                    return {
                        role: 'assistant',
                        content: text,
                        tool_calls: toolUses.map(tu => ({
                            id: tu.id,
                            type: 'function',
                            function: {
                                name: tu.name,
                                arguments: JSON.stringify(tu.input)
                            }
                        }))
                    };
                }
                return { role: 'assistant', content: msg.content };
            }

            return msg;
        }).flat();
    }

    async chat(messages, options = {}) {
        const formattedMessages = this.formatMessages(messages);

        const requestBody = {
            model: options.model || 'llama-3.3-70b-versatile',
            messages: formattedMessages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 8192
        };

        if (options.tools && options.tools.length > 0) {
            requestBody.tools = this.formatTools(options.tools);
            requestBody.tool_choice = 'auto';
        }

        const response = await axios.post(
            `${this.baseUrl}/chat/completions`,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${AI_KEYS.GROQ}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            }
        );

        const choice = response.data.choices[0];
        const toolCalls = [];

        if (choice.message.tool_calls) {
            for (const tc of choice.message.tool_calls) {
                toolCalls.push({
                    id: tc.id,
                    name: tc.function.name,
                    input: JSON.parse(tc.function.arguments)
                });
            }
        }

        return {
            text: choice.message.content || '',
            toolCalls,
            stopReason: choice.finish_reason,
            usage: this.getUsage(response.data)
        };
    }

    async *chatStream(messages, options = {}) {
        const formattedMessages = this.formatMessages(messages);

        const requestBody = {
            model: options.model || 'llama-3.3-70b-versatile',
            messages: formattedMessages,
            temperature: options.temperature || 0.7,
            max_tokens: options.maxTokens || 8192,
            stream: true
        };

        if (options.tools && options.tools.length > 0) {
            requestBody.tools = this.formatTools(options.tools);
            requestBody.tool_choice = 'auto';
        }

        const response = await axios.post(
            `${this.baseUrl}/chat/completions`,
            requestBody,
            {
                headers: {
                    'Authorization': `Bearer ${AI_KEYS.GROQ}`,
                    'Content-Type': 'application/json'
                },
                responseType: 'stream',
                timeout: 120000
            }
        );

        let fullText = '';
        const toolCallsMap = {};

        for await (const chunk of response.data) {
            const lines = chunk.toString().split('\n').filter(line => line.trim().startsWith('data:'));

            for (const line of lines) {
                const data = line.replace('data: ', '').trim();
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;

                    if (delta?.content) {
                        fullText += delta.content;
                        yield { type: 'text', text: delta.content };
                    }

                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            if (tc.index !== undefined) {
                                if (!toolCallsMap[tc.index]) {
                                    toolCallsMap[tc.index] = { id: tc.id, name: '', arguments: '' };
                                }
                                if (tc.function?.name) toolCallsMap[tc.index].name = tc.function.name;
                                if (tc.id) toolCallsMap[tc.index].id = tc.id;
                                if (tc.function?.arguments) toolCallsMap[tc.index].arguments += tc.function.arguments;
                            }
                        }
                    }
                } catch (e) {
                    // Skip unparseable chunks
                }
            }
        }

        const toolCalls = Object.values(toolCallsMap).map(tc => ({
            id: tc.id || `call_${Math.random().toString(36).substr(2, 9)}`,
            name: tc.name,
            input: tc.arguments ? JSON.parse(tc.arguments) : {}
        }));

        for (const toolCall of toolCalls) {
            yield { type: 'tool_call', toolCall };
        }

        yield { type: 'done', fullText, toolCalls };
    }

    getUsage(response) {
        return {
            inputTokens: response.usage?.prompt_tokens || 0,
            outputTokens: response.usage?.completion_tokens || 0,
            cachedTokens: 0
        };
    }
}

module.exports = GroqProvider;
