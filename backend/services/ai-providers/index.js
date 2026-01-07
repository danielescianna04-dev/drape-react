/**
 * AI Provider Factory
 * Unified interface for all AI providers
 */

const GeminiProvider = require('./gemini');
const ClaudeProvider = require('./claude');
const GroqProvider = require('./groq');
const { AI_MODELS, DEFAULT_AI_MODEL } = require('../../utils/constants');

// Provider instances (lazy initialized)
const providers = {
    gemini: null,
    anthropic: null,
    claude: null,
    groq: null
};

/**
 * Get or create a provider instance
 */
function getProvider(providerName) {
    // Normalize provider name
    const name = providerName === 'claude' ? 'anthropic' : providerName;

    if (!providers[name]) {
        switch (name) {
            case 'gemini':
            case 'google':
                providers.gemini = new GeminiProvider();
                break;
            case 'anthropic':
                providers.anthropic = new ClaudeProvider();
                break;
            case 'groq':
                providers.groq = new GroqProvider();
                break;
            default:
                throw new Error(`Unknown provider: ${providerName}`);
        }
    }

    return providers[name] || providers.gemini;
}

/**
 * Get provider for a specific model
 */
function getProviderForModel(modelName) {
    const modelConfig = AI_MODELS[modelName];
    if (!modelConfig) {
        console.warn(`Unknown model: ${modelName}, falling back to default`);
        return getProviderForModel(DEFAULT_AI_MODEL);
    }

    return {
        provider: getProvider(modelConfig.provider),
        modelId: modelConfig.modelId,
        config: modelConfig
    };
}

/**
 * Check which providers are available
 */
function getAvailableProviders() {
    const available = [];

    const gemini = new GeminiProvider();
    if (gemini.isAvailable()) available.push('gemini');

    const claude = new ClaudeProvider();
    if (claude.isAvailable()) available.push('anthropic');

    const groq = new GroqProvider();
    if (groq.isAvailable()) available.push('groq');

    return available;
}

/**
 * Get available models based on configured API keys
 */
function getAvailableModels() {
    const availableProviders = getAvailableProviders();
    const models = {};

    for (const [modelName, config] of Object.entries(AI_MODELS)) {
        if (availableProviders.includes(config.provider)) {
            models[modelName] = config;
        }
    }

    return models;
}

/**
 * Initialize all available providers
 */
async function initializeProviders() {
    const results = {};

    for (const providerName of getAvailableProviders()) {
        try {
            const provider = getProvider(providerName);
            await provider.initialize();
            results[providerName] = true;
            console.log(`✅ ${providerName} provider initialized`);
        } catch (error) {
            results[providerName] = false;
            console.error(`❌ Failed to initialize ${providerName}:`, error.message);
        }
    }

    return results;
}

/**
 * Standard tool definitions used across all providers
 */
const standardTools = [
    {
        name: 'read_file',
        description: 'Read the contents of a file in the project. Use this to examine code, configuration files, or any text file.',
        input_schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file relative to the project root'
                }
            },
            required: ['filePath']
        }
    },
    {
        name: 'write_file',
        description: 'Create a new file or overwrite an existing file with new content.',
        input_schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file relative to the project root'
                },
                content: {
                    type: 'string',
                    description: 'The complete content to write to the file'
                }
            },
            required: ['filePath', 'content']
        }
    },
    {
        name: 'edit_file',
        description: 'Edit an existing file by replacing specific text. The old text must match exactly.',
        input_schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file relative to the project root'
                },
                oldText: {
                    type: 'string',
                    description: 'The exact text to find and replace'
                },
                newText: {
                    type: 'string',
                    description: 'The new text to replace it with'
                }
            },
            required: ['filePath', 'oldText', 'newText']
        }
    },
    {
        name: 'glob_files',
        description: 'Find files matching a glob pattern in the project.',
        input_schema: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Glob pattern to match files (e.g., "**/*.js", "src/**/*.tsx")'
                }
            },
            required: ['pattern']
        }
    },
    {
        name: 'search_in_files',
        description: 'Search for a text pattern across all project files using grep.',
        input_schema: {
            type: 'object',
            properties: {
                pattern: {
                    type: 'string',
                    description: 'Text or regex pattern to search for'
                }
            },
            required: ['pattern']
        }
    },
    {
        name: 'execute_command',
        description: 'Execute a shell command in the project directory. Use for running builds, tests, npm commands, etc.',
        input_schema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute'
                }
            },
            required: ['command']
        }
    },
    {
        name: 'create_folder',
        description: 'Create a new folder/directory in the project. Creates parent directories if they do not exist.',
        input_schema: {
            type: 'object',
            properties: {
                folderPath: {
                    type: 'string',
                    description: 'Path to the folder to create relative to the project root (e.g., "src/components/new-folder")'
                }
            },
            required: ['folderPath']
        }
    },
    {
        name: 'delete_file',
        description: 'Delete a file or folder from the project. Use with caution as this permanently removes files.',
        input_schema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file or folder to delete relative to the project root'
                }
            },
            required: ['filePath']
        }
    }
];

module.exports = {
    getProvider,
    getProviderForModel,
    getAvailableProviders,
    getAvailableModels,
    initializeProviders,
    standardTools,
    GeminiProvider,
    ClaudeProvider,
    GroqProvider
};
