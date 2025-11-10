/**
 * Claude Code-style helper functions
 */

/**
 * Request deduplication cache
 * Prevents duplicate requests within 2 seconds
 */
const requestCache = new Map();
const REQUEST_DEBOUNCE_MS = 2000;

function isDuplicateRequest(userId, prompt) {
    const key = `${userId}:${prompt}`;
    const now = Date.now();

    if (requestCache.has(key)) {
        const lastRequest = requestCache.get(key);
        if (now - lastRequest < REQUEST_DEBOUNCE_MS) {
            return true; // Duplicate!
        }
    }

    requestCache.set(key, now);

    // Cleanup old entries every 100 requests
    if (requestCache.size > 100) {
        const cutoff = now - REQUEST_DEBOUNCE_MS;
        for (const [k, v] of requestCache.entries()) {
            if (v < cutoff) requestCache.delete(k);
        }
    }

    return false;
}

/**
 * Message summarization for context window management
 * Keeps recent messages full, summarizes older ones
 */
function summarizeMessages(messages, keepFullCount = 5) {
    if (messages.length <= keepFullCount) {
        return messages;
    }

    const recent = messages.slice(-keepFullCount);
    const older = messages.slice(0, -keepFullCount);

    // Summarize older messages in pairs (user + assistant)
    const summarized = [];
    for (let i = 0; i < older.length; i += 2) {
        if (i + 1 < older.length) {
            const userMsg = older[i];
            const assistantMsg = older[i + 1];

            // Create a brief summary
            const userPreview = userMsg.content.substring(0, 100);
            const assistantPreview = assistantMsg.content.substring(0, 100);

            summarized.push({
                role: 'user',
                content: `[Summary] User asked: "${userPreview}..."`
            });
            summarized.push({
                role: 'assistant',
                content: `[Summary] Assistant responded: "${assistantPreview}..."`
            });
        }
    }

    return [...summarized, ...recent];
}

/**
 * Create system message blocks with optional caching
 * Falls back gracefully if caching is not supported
 */
function createSystemBlocks(systemMessage, enableCaching = true) {
    if (enableCaching) {
        return [
            {
                type: "text",
                text: systemMessage,
                cache_control: { type: "ephemeral" }
            }
        ];
    } else {
        // Fallback: just return string
        return systemMessage;
    }
}

/**
 * Granular error handling (like Claude Code)
 * Classifies errors and returns user-friendly messages
 */
function handleAPIError(error) {
    const status = error.status || error.response?.status;
    const message = error.message || '';
    const errorType = error.error?.type || error.response?.data?.error?.type || '';

    // Authentication errors
    if (status === 401 || errorType === 'authentication_error') {
        return {
            type: 'auth',
            userMessage: '🔐 Errore di autenticazione - verifica la tua API key',
            shouldRetry: false,
            technicalDetails: message
        };
    }

    // Rate limit errors
    if (status === 429 || errorType === 'rate_limit_error' || message.includes('rate_limit')) {
        return {
            type: 'rate_limit',
            userMessage: '⏳ Rate limit raggiunto - attendo prima di riprovare...',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('ETIMEDOUT') || status === 408) {
        return {
            type: 'timeout',
            userMessage: '⏱️ Timeout - la richiesta ha impiegato troppo tempo',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Network errors
    if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('network')) {
        return {
            type: 'network',
            userMessage: '🌐 Errore di connessione - verifica la tua rete',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Invalid request errors
    if (status === 400 || errorType === 'invalid_request_error') {
        return {
            type: 'invalid_request',
            userMessage: '❌ Richiesta non valida - controlla i parametri',
            shouldRetry: false,
            technicalDetails: message
        };
    }

    // Server errors
    if (status >= 500 || errorType === 'api_error') {
        return {
            type: 'server_error',
            userMessage: '🔧 Errore del server Claude - riprovo tra poco...',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Context length errors
    if (message.includes('context_length') || message.includes('too long')) {
        return {
            type: 'context_length',
            userMessage: '📏 Troppo testo - riduco la conversazione e riprovo...',
            shouldRetry: true,
            technicalDetails: message
        };
    }

    // Generic error
    return {
        type: 'unknown',
        userMessage: `❌ Errore: ${message.substring(0, 100)}`,
        shouldRetry: false,
        technicalDetails: message
    };
}

/**
 * Basic telemetry/analytics tracking
 * Tracks usage metrics for monitoring
 */
const telemetryData = {
    requests: 0,
    tokens: { input: 0, output: 0, cached: 0 },
    errors: {},
    toolCalls: {},
    startTime: Date.now()
};

function trackRequest(data) {
    telemetryData.requests++;

    if (data.tokens) {
        telemetryData.tokens.input += data.tokens.input || 0;
        telemetryData.tokens.output += data.tokens.output || 0;
        telemetryData.tokens.cached += data.tokens.cached || 0;
    }

    if (data.error) {
        const errorType = data.error.type || 'unknown';
        telemetryData.errors[errorType] = (telemetryData.errors[errorType] || 0) + 1;
    }

    if (data.tools) {
        data.tools.forEach(tool => {
            telemetryData.toolCalls[tool] = (telemetryData.toolCalls[tool] || 0) + 1;
        });
    }
}

function getTelemetry() {
    const uptime = Math.floor((Date.now() - telemetryData.startTime) / 1000);
    const totalTokens = telemetryData.tokens.input + telemetryData.tokens.output;
    const cacheRate = totalTokens > 0
        ? ((telemetryData.tokens.cached / totalTokens) * 100).toFixed(1)
        : 0;

    return {
        uptime: `${Math.floor(uptime / 60)}m ${uptime % 60}s`,
        requests: telemetryData.requests,
        tokens: telemetryData.tokens,
        cacheHitRate: `${cacheRate}%`,
        errors: telemetryData.errors,
        topTools: Object.entries(telemetryData.toolCalls)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => `${name}(${count})`),
        costEstimate: calculateCostEstimate(telemetryData.tokens)
    };
}

/**
 * OPTIMIZATION 9: Tool Result Caching (like Claude Code)
 * Caches tool results to avoid re-reading same files
 *
 * OPTIMIZATION 14: More Aggressive Caching
 * Increased TTL from 5 minutes to 30 minutes for better performance
 * Increased cache size from 50 to 200 entries
 */
const toolResultCache = new Map();
const TOOL_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (increased from 5)
const MAX_CACHE_SIZE = 200; // Max cached results (increased from 50)

function getCachedToolResult(toolName, input) {
    const key = `${toolName}:${JSON.stringify(input)}`;
    const cached = toolResultCache.get(key);

    if (cached && Date.now() - cached.timestamp < TOOL_CACHE_TTL_MS) {
        console.log(`💾 Cache HIT for ${toolName}`);
        return cached.result;
    }

    return null;
}

function setCachedToolResult(toolName, input, result) {
    const key = `${toolName}:${JSON.stringify(input)}`;

    // Cleanup if cache is too large
    if (toolResultCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = toolResultCache.keys().next().value;
        toolResultCache.delete(oldestKey);
    }

    toolResultCache.set(key, {
        result,
        timestamp: Date.now()
    });
}

/**
 * OPTIMIZATION 10: Smart Message Pruning (like Claude Code)
 * Uses relevance scoring to keep only important messages
 */
function pruneMessages(messages, currentPrompt, maxMessages = 10) {
    if (messages.length <= maxMessages) {
        return messages;
    }

    // Always keep system message and last 3 messages
    const system = messages.filter(m => m.role === 'system');
    const recent = messages.slice(-3);
    const middle = messages.slice(system.length, -3);

    // Score middle messages by relevance
    const scored = middle.map(msg => {
        let score = 0;
        const content = msg.content?.toString().toLowerCase() || '';
        const prompt = currentPrompt.toLowerCase();

        // Higher score if message contains words from current prompt
        const promptWords = prompt.split(/\s+/).filter(w => w.length > 3);
        promptWords.forEach(word => {
            if (content.includes(word)) score += 2;
        });

        // Higher score for tool use messages
        if (Array.isArray(msg.content)) {
            msg.content.forEach(block => {
                if (block.type === 'tool_use' || block.type === 'tool_result') {
                    score += 3;
                }
            });
        }

        // Higher score for error messages (important context)
        if (content.includes('error') || content.includes('errore')) {
            score += 2;
        }

        return { msg, score };
    });

    // Keep top scored messages
    const keepCount = Math.max(0, maxMessages - system.length - recent.length);
    const kept = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, keepCount)
        .map(s => s.msg);

    console.log(`🧹 Pruned ${middle.length} messages to ${kept.length} (kept most relevant)`);
    return [...system, ...kept, ...recent];
}

/**
 * OPTIMIZATION 11: Adaptive Context Window (like Claude Code)
 * Adjusts context size based on expected response length
 */
function getAdaptiveContextSize(prompt, messages) {
    const lowerPrompt = prompt.toLowerCase();

    // Large response expected - reduce context
    if (
        lowerPrompt.includes('write') ||
        lowerPrompt.includes('create') ||
        lowerPrompt.includes('implement') ||
        lowerPrompt.includes('scrivi') ||
        lowerPrompt.includes('crea')
    ) {
        console.log('📉 Large response expected - reducing context to 5 messages');
        return 5;
    }

    // Small response expected - keep more context
    if (
        lowerPrompt.includes('what') ||
        lowerPrompt.includes('explain') ||
        lowerPrompt.includes('why') ||
        lowerPrompt.includes('cosa') ||
        lowerPrompt.includes('perché')
    ) {
        console.log('📈 Small response expected - keeping 12 messages');
        return 12;
    }

    // Default
    return 8;
}

/**
 * OPTIMIZATION 12: Cost Budgeting & Alerts (like Claude Code)
 * Tracks costs per user and sends alerts
 */
const userCosts = new Map();
const COST_PER_INPUT_TOKEN = 0.000003; // $3 per 1M tokens
const COST_PER_OUTPUT_TOKEN = 0.000015; // $15 per 1M tokens
const COST_PER_CACHED_TOKEN = 0.00000003; // 90% discount

function calculateCostEstimate(tokens) {
    const inputCost = (tokens.input - tokens.cached) * COST_PER_INPUT_TOKEN;
    const cachedCost = tokens.cached * COST_PER_CACHED_TOKEN;
    const outputCost = tokens.output * COST_PER_OUTPUT_TOKEN;
    const total = inputCost + cachedCost + outputCost;

    return {
        total: `$${total.toFixed(4)}`,
        input: `$${inputCost.toFixed(4)}`,
        cached: `$${cachedCost.toFixed(6)}`,
        output: `$${outputCost.toFixed(4)}`
    };
}

function trackUserCost(userId, tokens) {
    const cost = calculateCostEstimate(tokens);
    const costValue = parseFloat(cost.total.replace('$', ''));

    if (!userCosts.has(userId)) {
        userCosts.set(userId, { total: 0, requests: 0 });
    }

    const userData = userCosts.get(userId);
    userData.total += costValue;
    userData.requests++;

    // Alert if user exceeds $1
    if (userData.total > 1.0 && userData.requests % 10 === 0) {
        console.log(`💰 ALERT: User ${userId} has spent $${userData.total.toFixed(2)} over ${userData.requests} requests`);
    }

    return userData;
}

function getUserCostStats(userId) {
    return userCosts.get(userId) || { total: 0, requests: 0 };
}

module.exports = {
    isDuplicateRequest,
    summarizeMessages,
    createSystemBlocks,
    handleAPIError,
    trackRequest,
    getTelemetry,
    getCachedToolResult,
    setCachedToolResult,
    pruneMessages,
    getAdaptiveContextSize,
    trackUserCost,
    getUserCostStats,
    calculateCostEstimate
};
