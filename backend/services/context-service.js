const fs = require('fs');
const path = require('path');
const { getProvider } = require('./ai-providers');

/**
 * Advanced Context Engine
 * Manages conversation history to prevent Rate Limits (429) & Token Limits (400)
 */
class ContextService {
    constructor() {
        this.MAX_TOKENS = 5000; // Ultra Diet Mode: ~1.2k tokens to survive 30k TPM
        this.CHARS_PER_TOKEN = 4;
        this.SUMMARY_THRESHOLD = 6; // Aggressive: Summarize early
    }

    log(msg) {
        console.log(msg);
    }


    /**
     * Main entry point: Takes raw frontend history and returns optimized messages for AI
     */
    async optimizeContext(rawHistory, modelId, currentPrompt) {
        const start = Date.now();
        this.log(`🚀 OptimizeContext START. PromptLen: ${currentPrompt ? currentPrompt.length : 0}`);

        // 1. Sanitize (Fixes 400 Errors)
        let messages = this.sanitizeHistory(rawHistory);
        this.log(`   Sanitize done (${Date.now() - start}ms)`);

        // 2. Smart Truncation (Immediate reduction)
        messages = this.truncateToolOutputs(messages);
        this.log(`   Truncate done (${Date.now() - start}ms)`);

        // RAG: Inject Vector Context if prompt is provided
        // Optimization: Skip RAG for short prompts (e.g. "hi", "thanks") to save time/tokens
        if (currentPrompt && currentPrompt.length > 20) {
            try {
                this.log(`   RAG Search START...`);
                const vectorStore = require('./vector-store');
                if (vectorStore.isReady) {
                    const searchResults = await vectorStore.search(currentPrompt, 1); // Diet Mode: Only Top 1
                    this.log(`   RAG Search DONE (${Date.now() - start}ms). Found: ${searchResults.length}`);

                    if (searchResults.length > 0) {
                        const internalContext = searchResults.map(r =>
                            `--- FILE: ${r.file} ---\n${r.text}`
                        ).join('\n\n');

                        this.log(`🧠 [ContextEngine] RAG Injected ${searchResults.length} / 1 chunk.`);

                        // Inject as a separate "Context" message before the history
                        messages.push({
                            role: 'user',
                            content: `[RAG SYSTEM CONTEXT]: The following code snippets are semantically relevant to the user's request. Use them to answer if helpful:\n\n${internalContext}`
                        });
                    }
                }
            } catch (ragError) {
                console.warn('⚠️ [ContextEngine] RAG Search failed:', ragError.message);
            }
        } else {
            console.log(`🧠 [ContextEngine] Skipping RAG (Prompt length: ${currentPrompt ? currentPrompt.length : 0})`);
        }

        // Check total estimated tokens (approx 1 token = 4 chars)
        const totalChars = JSON.stringify(messages).length;

        // 3. Progressive Summarization
        // Trigger if: > 6 messages OR > 15000 chars (~3750 tokens)
        if (messages.length > this.SUMMARY_THRESHOLD || totalChars > this.MAX_TOKENS) {
            console.log(`🧠 [ContextEngine] Threshold Triggered (Count: ${messages.length}, Chars: ${totalChars}). Summarizing...`);
            messages = await this.compressWithSummary(messages);
        } else {
            console.log(`🧠 [ContextEngine] Skipping summary (Count: ${messages.length}, Chars: ${totalChars})`);
            // Fallback: strict slice if summary didn't run
            if (messages.length > 5) {
                messages = messages.slice(-5);
            }
        }

        return messages;
    }

    /**
     * Fixes malformed tool_results and strictly removes 'tool' property
     */
    sanitizeHistory(history) {
        const cleanHistory = [];

        for (const msg of history) {
            if (!msg.content) continue;

            const cleanMsg = { role: msg.role, content: msg.content };

            // Normalize 'user' type to 'user' role
            if (msg.type === 'user') cleanMsg.role = 'user';
            if (msg.type === 'text' || msg.type === 'model') cleanMsg.role = 'assistant';

            // Deep clean tool_results
            if (Array.isArray(msg.content)) {
                cleanMsg.content = msg.content.map(block => {
                    if (block.type === 'tool_result') {
                        return {
                            type: 'tool_result',
                            tool_use_id: String(block.tool_use_id),
                            content: String(block.content),
                            is_error: block.is_error
                        };
                    }
                    return block;
                });
            } else if (msg.content && typeof msg.content === 'object' && msg.content.type === 'tool_result') {
                // Fix single object edge case
                cleanMsg.content = [{
                    type: 'tool_result',
                    tool_use_id: String(msg.content.tool_use_id),
                    content: String(msg.content.content),
                    is_error: msg.content.is_error
                }];
            }

            cleanHistory.push(cleanMsg);
        }
        return cleanHistory;
    }

    /**
     * Truncates massive tool outputs (e.g. cat huge_file.txt)
     */
    truncateToolOutputs(messages) {
        return messages.map(msg => {
            if (Array.isArray(msg.content)) {
                msg.content = msg.content.map(block => {
                    if (block.type === 'tool_result' && block.content && block.content.length > 500) {
                        return {
                            ...block,
                            content: block.content.substring(0, 500) + '\n... [Truncated 500 chars] ...'
                        };
                    }
                    return block;
                });
            }
            return msg;
        });
    }

    /**
     * Compresses history by summarizing the oldest half
     */
    async compressWithSummary(messages) {
        this.log('🧠 [ContextEngine] Triggering Progressive Summarization...');
        const start = Date.now();

        // Keep last 5 messages intact (Recent Context)
        const recentMessages = messages.slice(-5);
        const olderMessages = messages.slice(0, -5);

        if (olderMessages.length === 0) return recentMessages;

        try {
            // Use Gemini for fast, cheap summarization
            const summarizer = getProvider('gemini'); // Default to Gemini Flash usually
            if (!summarizer) return messages.slice(-10); // Fail safe

            const summaryPrompt = `
                Analyze the following conversation history and create a concise technical summary.
                Focus on:
                1. What the user wants to achieve.
                2. What tools were used and their outcomes (success/fail).
                3. Current state of the task.
                
                Keep it under 50 words.
                
                HISTORY:
                ${JSON.stringify(olderMessages)}
            `;

            const summaryResponse = await summarizer.chat([{ role: 'user', content: summaryPrompt }], {
                maxTokens: 300
            });

            const summaryText = summaryResponse.text || "Previous conversation summary unavailable.";

            this.log(`🧠 [ContextEngine] Summary generated (${Date.now() - start}ms): ${summaryText.substring(0, 50)}...`);

            // Create a "System Memory" message
            const memoryMessage = {
                role: 'user',
                content: `[SYSTEM MEMORY]: ${summaryText}`
            };

            return [memoryMessage, ...recentMessages];

        } catch (error) {
            this.log(`⚠️ [ContextEngine] Summarization FAILED (${Date.now() - start}ms): ${error.message}`);
            if (error.response) console.error('   API Error:', JSON.stringify(error.response.data));

            // Fallback: Relaxed slice to 8 (User requested "don't be forgetful")
            return messages.slice(-8);
        }
    }
}

module.exports = new ContextService();
