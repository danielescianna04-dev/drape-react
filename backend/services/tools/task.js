/**
 * Task Tool - Launch specialized sub-agents
 * Based on Claude Code's Task tool specification
 */

const { SubAgentLoop } = require('../sub-agent-loop');
const { DEFAULT_AI_MODEL } = require('../../utils/constants');

/**
 * Available sub-agent types
 */
const AGENT_TYPES = {
    'explore': {
        name: 'Explore',
        description: 'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns, search code for keywords, or answer questions about the codebase.',
        tools: ['glob_search', 'grep_search']
    },
    'plan': {
        name: 'Plan',
        description: 'Software architect agent for designing implementation plans. Use this when you need to plan the implementation strategy for a task.',
        tools: ['glob_search', 'grep_search']
    },
    'general': {
        name: 'General-purpose',
        description: 'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.',
        tools: ['glob_search', 'grep_search']
    },
    'bash': {
        name: 'Bash',
        description: 'Command execution specialist for running bash commands. Use this for git operations, command execution, and other terminal tasks.',
        tools: []
    }
};

/**
 * Launch a sub-agent to handle a task
 * @param {string} subagentType - Type of agent to launch
 * @param {string} prompt - Task description for the agent
 * @param {string} description - Short description (3-5 words)
 * @param {string} model - AI model to use
 * @param {string} projectId - Project ID
 * @param {boolean} runInBackground - Run in background (not implemented yet)
 * @param {string} resume - Agent ID to resume (not implemented yet)
 * @returns {AsyncGenerator} Stream of sub-agent events
 */
async function* launchSubAgent(subagentType, prompt, description, model = DEFAULT_AI_MODEL, projectId, runInBackground = false, resume = null) {
    // Validate agent type
    if (!AGENT_TYPES[subagentType]) {
        throw new Error(`Unknown sub-agent type: ${subagentType}. Available types: ${Object.keys(AGENT_TYPES).join(', ')}`);
    }

    // Validate inputs
    if (!prompt) {
        throw new Error('Prompt is required');
    }

    if (!projectId) {
        throw new Error('Project ID is required');
    }

    // Create and run sub-agent
    const subAgent = new SubAgentLoop(subagentType, projectId);

    yield {
        type: 'task_start',
        subagentType,
        description: description || `Running ${subagentType} agent`,
        timestamp: new Date().toISOString()
    };

    try {
        // Stream sub-agent execution
        for await (const event of subAgent.run(prompt, model)) {
            yield event;
        }

        yield {
            type: 'task_complete',
            result: subAgent.result,
            iterations: subAgent.iteration,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        yield {
            type: 'task_error',
            error: error.message,
            timestamp: new Date().toISOString()
        };
        throw error;
    }
}

/**
 * Get available agent types as string for system prompt
 */
function getAgentTypesString() {
    return Object.entries(AGENT_TYPES).map(([type, info]) => {
        return `- ${type}: ${info.description} (Tools: ${info.tools.join(', ') || 'None'})`;
    }).join('\n');
}

module.exports = { launchSubAgent, getAgentTypesString, AGENT_TYPES };
