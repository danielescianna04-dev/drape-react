/**
 * Drape Backend - Constants
 * Centralized configuration and constants
 */

require('dotenv').config();

// Server Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Google Cloud Configuration
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'drape-mobile-ide';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const WORKSTATION_CLUSTER = process.env.WORKSTATION_CLUSTER || '';
const WORKSTATION_CONFIG = process.env.WORKSTATION_CONFIG || '';

// Coder Configuration
const CODER_API_URL = process.env.CODER_API_URL || 'http://drape.info';
const CODER_SESSION_TOKEN = process.env.CODER_SESSION_TOKEN || '';
const CODER_WILDCARD_DOMAIN = process.env.CODER_WILDCARD_DOMAIN || 'drape.info';
const CODER_CLI_PATH = process.env.CODER_CLI_PATH || 'coder';

// AI API Keys
const AI_KEYS = {
    GEMINI: process.env.GEMINI_API_KEY || '',
    CLAUDE: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    GROQ: process.env.GROQ_API_KEY || '',
    OPENAI: process.env.OPENAI_API_KEY || ''
};

// AI Model Configurations
const AI_MODELS = {
    // Groq Models (Fast)
    'llama-3.3-70b': {
        provider: 'groq',
        modelId: 'llama-3.3-70b-versatile',
        displayName: 'Llama 3.3 70B',
        supportsTools: true,
        maxTokens: 8192
    },
    'llama-3.1-8b': {
        provider: 'groq',
        modelId: 'llama-3.1-8b-instant',
        displayName: 'Llama 3.1 8B (Fast)',
        supportsTools: true,
        maxTokens: 8192
    },

    // Gemini Models
    'gemini-3-pro': {
        provider: 'gemini',
        modelId: 'gemini-3-pro-preview',
        displayName: 'Gemini 3.0 Pro',
        supportsTools: true,
        maxTokens: 1000000  // 1M context window
    },
    'gemini-3-flash': {
        provider: 'gemini',
        modelId: 'gemini-3-flash-preview',  // Gemini 3.0 Flash with multimodal and function calling
        displayName: 'Gemini 3.0 Flash',
        supportsTools: true,
        maxTokens: 8192
    },
    'gemini-2.5-flash': {
        provider: 'gemini',
        modelId: 'gemini-2.5-flash-image',
        displayName: 'Gemini 2.5 Flash',
        supportsTools: true,
        maxTokens: 8192
    },
    'gemini-2.5-flash-image': {
        provider: 'gemini',
        modelId: 'gemini-2.5-flash-image',
        displayName: 'Gemini 2.5 Flash Image (High Quota)',
        supportsTools: true,
        maxTokens: 8192
    },
    'gemini-exp-1206': {
        provider: 'gemini',
        modelId: 'gemini-exp-1206',
        displayName: 'Gemini Exp 1206',
        supportsTools: true,
        maxTokens: 8192
    },
    'gemini-2.0-flash-thinking': {
        provider: 'gemini',
        modelId: 'gemini-2.0-flash-thinking-exp-01-21',
        displayName: 'Gemini 2.0 Flash Thinking',
        supportsTools: true,
        maxTokens: 32768
    },

    // Claude Models
    'claude-4-5-opus': {
        provider: 'anthropic',
        modelId: 'claude-opus-4-5-20251101',
        displayName: 'Claude 4.5 Opus',
        supportsTools: true,
        maxTokens: 32000
    },
    'claude-4-5-sonnet': {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude 4.5 Sonnet',
        supportsTools: true,
        maxTokens: 64000
    },
    'claude-3.5-sonnet': {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude 4.5 Sonnet',
        supportsTools: true,
        maxTokens: 64000
    },
    'claude-sonnet-4': {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude 4.5 Sonnet',
        supportsTools: true,
        maxTokens: 64000
    },
    'claude-3.5-haiku': {
        provider: 'anthropic',
        modelId: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku (Fast)',
        supportsTools: true,
        maxTokens: 8192
    }
};

// Default AI Model (fallback when user doesn't specify)
const DEFAULT_AI_MODEL = 'gemini-3-flash';

// File Operation Limits
const FILE_LIMITS = {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_SEARCH_RESULTS: 50,
    MAX_GLOB_RESULTS: 100,
    COMMAND_TIMEOUT: 30000, // 30 seconds
    DEV_SERVER_TIMEOUT: 120000 // 2 minutes
};

// Directories to ignore
const IGNORED_DIRS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    '.expo',
    '__pycache__',
    'venv',
    '.venv',
    'coverage',
    '.cache'
];

// Text file extensions for search
const TEXT_EXTENSIONS = [
    '.js', '.jsx', '.ts', '.tsx',
    '.json', '.txt', '.md', '.html',
    '.css', '.scss', '.less',
    '.py', '.java', '.go', '.rs',
    '.c', '.cpp', '.h', '.hpp',
    '.rb', '.php', '.swift', '.kt',
    '.yaml', '.yml', '.toml',
    '.sh', '.bash', '.zsh'
];

// GitHub Configuration
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

module.exports = {
    PORT,
    NODE_ENV,
    GOOGLE_CLOUD_PROJECT,
    LOCATION,
    WORKSTATION_CLUSTER,
    WORKSTATION_CONFIG,
    CODER_API_URL,
    CODER_SESSION_TOKEN,
    CODER_WILDCARD_DOMAIN,
    CODER_CLI_PATH,
    AI_KEYS,
    AI_MODELS,
    DEFAULT_AI_MODEL,
    FILE_LIMITS,
    IGNORED_DIRS,
    TEXT_EXTENSIONS,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET
};
