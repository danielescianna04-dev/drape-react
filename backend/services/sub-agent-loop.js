/**
 * Sub-Agent Loop - Specialized agents for complex tasks
 * Based on Claude Code's Task tool and sub-agent architecture
 */

const { getProviderForModel } = require('./ai-providers');
const { DEFAULT_AI_MODEL } = require('../utils/constants');
const { globSearch } = require('./tools/glob');
const { grepSearch } = require('./tools/grep');

class SubAgentLoop {
    constructor(agentType, projectId, parentContext = null) {
        this.agentType = agentType;
        this.projectId = projectId;
        this.parentContext = parentContext;
        this.iteration = 0;
        this.maxIterations = 50;
        this.isComplete = false;
        this.result = null;
    }

    /**
     * Get tools for this sub-agent
     */
    getTools() {
        // Sub-agents have access to limited tools
        return [
            {
                name: 'glob_search',
                description: 'Search for files matching a glob pattern',
                input_schema: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Glob pattern like **/*.js' },
                        path: { type: 'string', description: 'Directory to search in' },
                        limit: { type: 'number', description: 'Max results to return' }
                    },
                    required: ['pattern']
                }
            },
            {
                name: 'grep_search',
                description: 'Search for content in files using regex',
                input_schema: {
                    type: 'object',
                    properties: {
                        pattern: { type: 'string', description: 'Regex pattern to search for' },
                        options: { type: 'object', description: 'Search options' }
                    },
                    required: ['pattern']
                }
            }
        ];
    }

    /**
     * Get system prompt for this agent type
     */
    getSystemPrompt() {
        const prompts = {
            'explore': this.getExplorePrompt(),
            'plan': this.getPlanPrompt(),
            'general': this.getGeneralPrompt(),
            'bash': this.getBashPrompt()
        };

        return prompts[this.agentType] || prompts['general'];
    }

    /**
     * Explore agent - Fast codebase exploration
     */
    getExplorePrompt() {
        return `You are a fast exploration agent specialized in searching codebases.

Your job is to quickly find files, search for patterns, and answer questions about code structure.

Available tools:
- glob_search(pattern, path): Find files matching glob patterns
- grep_search(pattern, options): Search file contents with regex

Guidelines:
- Be FAST - prefer parallel searches when possible
- Use glob for file name patterns ("**/*.js", "src/**/*.tsx")
- Use grep for content search
- Return concise, structured results
- Thoroughness level: quick (basic searches only)

When you've found the answer, respond with your findings and STOP.`;
    }

    /**
     * Plan agent - Implementation planning
     */
    getPlanPrompt() {
        return `You are a software architect agent specialized in planning implementations.

Your job is to design implementation strategies, identify critical files, and create step-by-step plans.

Available tools:
- glob_search(pattern, path): Find relevant files
- grep_search(pattern, options): Understand existing code

Guidelines:
- Explore the codebase first to understand architecture
- Identify all files that need changes
- Consider dependencies and side effects
- Create detailed, actionable step-by-step plans
- Consider trade-offs and alternatives

Return a structured implementation plan with:
1. Files to modify
2. Step-by-step instructions
3. Potential risks/considerations`;
    }

    /**
     * General-purpose agent - Complex multi-step tasks
     */
    getGeneralPrompt() {
        return `You are a general-purpose autonomous agent for complex tasks.

You can research, plan, and execute multi-step operations.

Available tools:
- glob_search(pattern, path): Find files
- grep_search(pattern, options): Search contents

Guidelines:
- Break down complex tasks into steps
- Research before acting
- Be thorough but efficient
- Return clear, structured results`;
    }

    /**
     * Bash specialist - Command execution
     */
    getBashPrompt() {
        return `You are a bash command specialist.

Your job is to execute terminal commands and return results.

Guidelines:
- Understand command intent
- Validate safety
- Execute and return output
- Handle errors gracefully`;
    }

    /**
     * Execute the sub-agent with a given prompt
     */
    async *run(prompt, model = DEFAULT_AI_MODEL) {
        const { provider, modelId } = getProviderForModel(model);
        if (!provider.client && provider.isAvailable()) {
            await provider.initialize();
        }

        const systemPrompt = this.getSystemPrompt();
        const messages = [{
            role: 'user',
            content: prompt
        }];

        const tools = this.getTools();

        yield {
            type: 'sub_agent_start',
            agentType: this.agentType,
            model,
            timestamp: new Date().toISOString()
        };

        while (this.iteration < this.maxIterations && !this.isComplete) {
            this.iteration++;

            yield {
                type: 'sub_agent_iteration',
                iteration: this.iteration,
                timestamp: new Date().toISOString()
            };

            try {
                // Call AI using provider
                let text = '';
                let toolCalls = [];

                const stream = provider.chatStream(messages, {
                    model: modelId,
                    maxTokens: 4000,
                    temperature: 0.7,
                    systemPrompt,
                    tools
                });

                for await (const chunk of stream) {
                    if (chunk.type === 'text') {
                        text += chunk.text;
                    } else if (chunk.type === 'tool_use') {
                        toolCalls.push(chunk);
                    }
                }

                // Process response

                if (toolCalls && toolCalls.length > 0) {
                    // Execute tools
                    const toolResults = await this.executeTools(toolCalls);

                    yield {
                        type: 'sub_agent_tool_use',
                        tools: toolCalls.map(t => t.name),
                        timestamp: new Date().toISOString()
                    };

                    // Add to messages
                    messages.push({
                        role: 'assistant',
                        content: text || '',
                        toolCalls
                    });
                    messages.push({
                        role: 'tool',
                        content: JSON.stringify(toolResults)
                    });
                } else if (text) {
                    // Text-only response - agent is done
                    this.isComplete = true;
                    this.result = text;

                    yield {
                        type: 'sub_agent_complete',
                        result: text,
                        iterations: this.iteration,
                        timestamp: new Date().toISOString()
                    };
                }
            } catch (error) {
                yield {
                    type: 'sub_agent_error',
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                throw error;
            }
        }

        return this.result;
    }

    /**
     * Execute tool calls
     */
    async executeTools(toolCalls) {
        const results = [];

        for (const toolCall of toolCalls) {
            try {
                let result;

                switch (toolCall.name) {
                    case 'glob_search':
                        result = await globSearch(
                            toolCall.args.pattern,
                            toolCall.args.path || '.',
                            toolCall.args.limit || 100
                        );
                        break;

                    case 'grep_search':
                        result = await grepSearch(
                            toolCall.args.pattern,
                            toolCall.args.options || {}
                        );
                        break;

                    default:
                        result = { error: `Unknown tool: ${toolCall.name}` };
                }

                results.push({
                    tool: toolCall.name,
                    success: true,
                    result
                });
            } catch (error) {
                results.push({
                    tool: toolCall.name,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Call Gemini API
     */
    async callGemini(systemPrompt, messages, modelConfig) {
        const genAI = new GoogleGenerativeAI(AI_KEYS.GEMINI);
        const model = genAI.getGenerativeModel({
            model: modelConfig.modelId,
            systemInstruction: systemPrompt
        });

        const chat = model.startChat({
            history: messages.slice(0, -1).map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))
        });

        const result = await chat.sendMessage(messages[messages.length - 1].content);
        const response = result.response;

        return {
            text: response.text(),
            toolCalls: [] // Gemini tool calling would be implemented here
        };
    }

    /**
     * Call Claude API
     */
    async callClaude(systemPrompt, messages, modelConfig) {
        const client = new Anthropic({ apiKey: AI_KEYS.CLAUDE });

        const response = await client.messages.create({
            model: modelConfig.modelId,
            max_tokens: modelConfig.maxTokens,
            system: systemPrompt,
            messages: messages.map(m => ({
                role: m.role === 'tool' ? 'user' : m.role,
                content: m.content
            }))
        });

        return {
            text: response.content[0]?.text || '',
            toolCalls: [] // Claude tool calling would be implemented here
        };
    }

    /**
     * Call Groq API
     */
    async callGroq(systemPrompt, messages, modelConfig) {
        const groq = new Groq({ apiKey: AI_KEYS.GROQ });

        const response = await groq.chat.completions.create({
            model: modelConfig.modelId,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.map(m => ({
                    role: m.role === 'tool' ? 'user' : m.role,
                    content: m.content
                }))
            ],
            max_tokens: modelConfig.maxTokens
        });

        return {
            text: response.choices[0]?.message?.content || '',
            toolCalls: [] // Groq tool calling would be implemented here
        };
    }
}

module.exports = { SubAgentLoop };
