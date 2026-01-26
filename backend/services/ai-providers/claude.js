/**
 * Claude (Anthropic) AI Provider
 * Integration with Anthropic's Claude API
 */

const BaseAIProvider = require('./base');
const { AI_KEYS } = require('../../utils/constants');

class ClaudeProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'claude';
        this.supportsTools = true;
        this.supportsStreaming = true;
        this.client = null;
    }

    async initialize() {
        if (!this.isAvailable()) {
            throw new Error('CLAUDE_API_KEY is not configured');
        }

        const Anthropic = require('@anthropic-ai/sdk');
        this.client = new Anthropic({ apiKey: AI_KEYS.CLAUDE });
        return true;
    }

    isAvailable() {
        return !!AI_KEYS.CLAUDE;
    }

    formatTools(tools) {
        return tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: t.input_schema || t.parameters
        }));
    }

    formatMessages(messages) {
        let systemMessage = '';
        const formattedMessages = [];

        for (const msg of messages) {
            if (msg.role === 'system') {
                systemMessage = msg.content;
                continue;
            }

            // Deep clean tool_results in user messages to prevent 400 errors
            if (msg.role === 'user' && Array.isArray(msg.content)) {
                const cleanContent = msg.content.map(block => {
                    if (block.type === 'tool_result') {
                        // FORCEFULLY strip 'tool' and other illegal props by rebuilding the object
                        return {
                            type: 'tool_result',
                            tool_use_id: block.tool_use_id,
                            content: block.content,
                            is_error: block.is_error
                        };
                    }
                    return block;
                });
                formattedMessages.push({ role: 'user', content: cleanContent });
            } else {
                formattedMessages.push(msg);
            }
        }

        return { messages: formattedMessages, system: systemMessage };
    }

    async chat(messages, options = {}) {
        if (!this.client) {
            await this.initialize();
        }

        const { messages: formattedMessages, system } = this.formatMessages(messages);

        const requestParams = {
            model: options.model || 'claude-sonnet-4-20250514',
            max_tokens: options.maxTokens || 8192,
            messages: formattedMessages
        };

        // PROMPT CACHING: Cache system prompt for 90% cost reduction on repeated calls
        // https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
        if (system) {
            requestParams.system = [
                {
                    type: "text",
                    text: system,
                    cache_control: { type: "ephemeral" }  // 5 min TTL, refreshed on use
                }
            ];
        }

        if (options.tools && options.tools.length > 0) {
            requestParams.tools = this.formatTools(options.tools);
        }

        // DEBUG: Deep inspection of messages before sending
        try {
            const userMsg = requestParams.messages.find(m => m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'));
            if (userMsg) {
                console.log('🕵️ CLAUDE PROVIDER - OUTGOING TOOL RESULT:', JSON.stringify(userMsg.content.find(c => c.type === 'tool_result'), null, 2));
            }
        } catch (e) { }

        const response = await this.client.messages.create(requestParams);

        let text = '';
        const toolCalls = [];

        for (const block of response.content) {
            if (block.type === 'text') {
                text += block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input
                });
            }
        }

        return {
            text,
            toolCalls,
            stopReason: response.stop_reason,
            usage: this.getUsage(response)
        };
    }

    async *chatStream(messages, options = {}) {
        if (!this.client) {
            await this.initialize();
        }

        const { messages: formattedMessages, system } = this.formatMessages(messages);

        const requestParams = {
            model: options.model || 'claude-sonnet-4-20250514',
            max_tokens: options.maxTokens || 8192,
            messages: formattedMessages,
            stream: true
        };

        // PROMPT CACHING: Cache system prompt for 90% cost reduction on repeated calls
        // https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
        if (system) {
            requestParams.system = [
                {
                    type: "text",
                    text: system,
                    cache_control: { type: "ephemeral" }  // 5 min TTL, refreshed on use
                }
            ];
        }

        if (options.tools && options.tools.length > 0) {
            requestParams.tools = this.formatTools(options.tools);
        }

        // DEBUG: Deep inspection of messages before sending (STREAM)
        try {
            const userMsg = requestParams.messages.find(m => m.role === 'user' && Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'));
            if (userMsg) {
                console.log('🕵️ CLAUDE PROVIDER - OUTGOING TOOL RESULT (STREAM):', JSON.stringify(userMsg.content.find(c => c.type === 'tool_result'), null, 2));
            }
        } catch (e) { }

        const stream = await this.client.messages.create(requestParams);

        let fullText = '';
        let toolCalls = [];
        let currentToolUse = null;
        let stopReason = null;
        let isThinking = false;
        let usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, cacheCreationTokens: 0 };

        for await (const event of stream) {
            if (event.type === 'message_start') {
                usage.inputTokens = event.message?.usage?.input_tokens || 0;
                usage.cachedTokens = event.message?.usage?.cache_read_input_tokens || 0;
                usage.cacheCreationTokens = event.message?.usage?.cache_creation_input_tokens || 0;

                // Log cache stats for debugging
                if (usage.cachedTokens > 0 || usage.cacheCreationTokens > 0) {
                    console.log(`💾 [Claude Cache] Read: ${usage.cachedTokens} tokens (90% saved), Created: ${usage.cacheCreationTokens} tokens`);
                }
            } else if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'tool_use') {
                    currentToolUse = {
                        id: event.content_block.id,
                        name: event.content_block.name,
                        input: ''
                    };
                    yield { type: 'tool_start', name: event.content_block.name };
                } else if (event.content_block?.type === 'thinking') {
                    isThinking = true;
                    yield { type: 'thinking_start' };
                }
            } else if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta') {
                    fullText += event.delta.text;
                    yield { type: 'text', text: event.delta.text };
                } else if (event.delta?.type === 'thinking_delta') {
                    yield { type: 'thinking', text: event.delta.thinking };
                } else if (event.delta?.type === 'input_json_delta' && currentToolUse) {
                    currentToolUse.input += event.delta.partial_json;
                }
            } else if (event.type === 'content_block_stop') {
                if (isThinking) {
                    isThinking = false;
                    yield { type: 'thinking_end' };
                } else if (currentToolUse) {
                    try {
                        currentToolUse.input = JSON.parse(currentToolUse.input);
                    } catch (e) {
                        currentToolUse.input = {};
                    }
                    toolCalls.push(currentToolUse);
                    yield {
                        type: 'tool_use',
                        ...currentToolUse
                    };
                    currentToolUse = null;
                }
            } else if (event.type === 'message_delta') {
                stopReason = event.delta?.stop_reason;
                if (event.usage) {
                    usage.outputTokens = event.usage.output_tokens || 0;
                }
            }
        }

        yield { type: 'done', fullText, toolCalls, stopReason, usage };
    }

    parseToolCalls(response) {
        const toolCalls = [];

        for (const block of response.content || []) {
            if (block.type === 'tool_use') {
                toolCalls.push({
                    id: block.id,
                    name: block.name,
                    input: block.input
                });
            }
        }

        return toolCalls;
    }

    formatToolResults(results) {
        return results.map(result => ({
            type: 'tool_result',
            tool_use_id: result.id,
            content: result.content
        }));
    }

    getUsage(response) {
        const usage = {
            inputTokens: response.usage?.input_tokens || 0,
            outputTokens: response.usage?.output_tokens || 0,
            cachedTokens: response.usage?.cache_read_input_tokens || 0,
            cacheCreationTokens: response.usage?.cache_creation_input_tokens || 0
        };

        // Log cache stats for debugging
        if (usage.cachedTokens > 0 || usage.cacheCreationTokens > 0) {
            console.log(`💾 [Claude Cache] Read: ${usage.cachedTokens} tokens (90% saved), Created: ${usage.cacheCreationTokens} tokens`);
        }

        return usage;
    }
}

module.exports = ClaudeProvider;
