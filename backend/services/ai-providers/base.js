/**
 * Base AI Provider Interface
 * Abstract class that all AI providers must implement
 */

class BaseAIProvider {
    constructor(config = {}) {
        this.name = 'base';
        this.config = config;
        this.supportsTools = false;
        this.supportsStreaming = true;
    }

    /**
     * Initialize the provider with API key
     */
    async initialize() {
        throw new Error('initialize() must be implemented by subclass');
    }

    /**
     * Check if the provider is available (has API key)
     */
    isAvailable() {
        throw new Error('isAvailable() must be implemented by subclass');
    }

    /**
     * Send a chat completion request
     * @param {Array} messages - Array of message objects
     * @param {Object} options - Additional options (model, temperature, etc.)
     * @returns {Promise<Object>} - Response object
     */
    async chat(messages, options = {}) {
        throw new Error('chat() must be implemented by subclass');
    }

    /**
     * Send a streaming chat completion request
     * @param {Array} messages - Array of message objects
     * @param {Object} options - Additional options
     * @returns {AsyncGenerator} - Async generator yielding chunks
     */
    async *chatStream(messages, options = {}) {
        throw new Error('chatStream() must be implemented by subclass');
    }

    /**
     * Convert tools to provider-specific format
     * @param {Array} tools - Standard tool definitions
     * @returns {Array} - Provider-specific tool format
     */
    formatTools(tools) {
        return tools;
    }

    /**
     * Convert messages to provider-specific format
     * @param {Array} messages - Standard message format
     * @returns {Array} - Provider-specific message format
     */
    formatMessages(messages) {
        return messages;
    }

    /**
     * Parse tool calls from response
     * @param {Object} response - Provider response
     * @returns {Array} - Standardized tool calls
     */
    parseToolCalls(response) {
        return [];
    }

    /**
     * Format tool results for sending back to the model
     * @param {Array} results - Tool execution results
     * @returns {Object} - Provider-specific format
     */
    formatToolResults(results) {
        return results;
    }

    /**
     * Get usage/token information from response
     * @param {Object} response - Provider response
     * @returns {Object} - Usage info {inputTokens, outputTokens, cachedTokens}
     */
    getUsage(response) {
        return {
            inputTokens: 0,
            outputTokens: 0,
            cachedTokens: 0
        };
    }
}

module.exports = BaseAIProvider;
