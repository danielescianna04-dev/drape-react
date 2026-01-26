/**
 * Agent Routes
 * API endpoints for AI agent with tool execution
 * Supports fast and planning modes with SSE streaming
 *
 * Ralph Loop - "Iteration > Perfection"
 */

const express = require('express');
const router = express.Router();
const flyService = require('../services/fly-service');
const workspaceOrchestrator = require('../services/workspace-orchestrator');
const TOOLS_CONFIG = require('../services/agent-tools.json');

/**
 * Force reload agent-loop module to get latest code
 * This is necessary because Node.js caches modules in require.cache
 */
function getAgentLoop() {
    const agentLoopPath = require.resolve('../services/agent-loop');
    delete require.cache[agentLoopPath];
    return require('../services/agent-loop');
}

// Initial load for other exports
const { saveProjectContext, detectIndustry, extractFeatures } = require('../services/agent-loop');

// Store approved plans for execution
const approvedPlans = new Map();

/**
 * Execute a tool on the VM
 */
async function executeTool(toolName, input, agentUrl, machineId, projectId) {
    switch (toolName) {
        case 'write_file': {
            // Use orchestrator to save to Firebase AND sync to VM with file watcher notification
            const result = await workspaceOrchestrator.writeFile(projectId, input.path, input.content);
            if (!result.success) {
                return { success: false, error: 'Failed to write file' };
            }
            return { success: true, message: `Written ${input.path} (${input.content.length} bytes)` };
        }

        case 'read_file': {
            const result = await flyService.exec(agentUrl, `cat "/home/coder/project/${input.path}"`, '/home/coder/project', machineId, 10000);
            if (result.exitCode !== 0) {
                return { success: false, error: result.stderr };
            }
            return { success: true, content: result.stdout };
        }

        case 'list_directory': {
            const path = input.path === '.' ? '/home/coder/project' : `/home/coder/project/${input.path}`;
            const result = await flyService.exec(agentUrl, `ls -la "${path}"`, '/home/coder/project', machineId, 10000);
            if (result.exitCode !== 0) {
                return { success: false, error: result.stderr };
            }
            return { success: true, content: result.stdout };
        }

        case 'run_command': {
            // CRITICAL: Ensure Git repo exists if command might modify files
            const mayModifyFiles = /\b(rm|mv|cp|mkdir|touch|git\s+(rm|add|commit)|npm|pnpm|yarn)\b/i.test(input.command);
            if (mayModifyFiles) {
                try {
                    await workspaceOrchestrator.ensureGitRepo(projectId, agentUrl, machineId);
                } catch (e) {
                    console.warn(`⚠️ ensureGitRepo failed: ${e.message}`);
                }
            }

            const timeout = input.timeout_ms || 60000;
            const result = await flyService.exec(agentUrl, input.command, '/home/coder/project', machineId, timeout);
            return {
                success: result.exitCode === 0,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr
            };
        }

        case 'edit_file': {
            // Read, replace, write using orchestrator
            const readResult = await flyService.exec(agentUrl, `cat "/home/coder/project/${input.path}"`, '/home/coder/project', machineId, 10000);
            if (readResult.exitCode !== 0) {
                return { success: false, error: `Cannot read file: ${readResult.stderr}` };
            }
            if (!readResult.stdout.includes(input.search)) {
                return { success: false, error: 'Search text not found in file' };
            }
            const newContent = readResult.stdout.replace(input.search, input.replace);

            // Use orchestrator to save to Firebase AND sync to VM with file watcher notification
            const result = await workspaceOrchestrator.writeFile(projectId, input.path, newContent);
            if (!result.success) {
                return { success: false, error: 'Failed to write file' };
            }
            return { success: true, message: `Edited ${input.path}` };
        }

        case 'signal_completion': {
            return { success: true, completed: true, ...input };
        }

        default:
            return { success: false, error: `Unknown tool: ${toolName}` };
    }
}

/**
 * GET /agent/tools
 * Get available tools schema
 */
router.get('/tools', (req, res) => {
    res.json({
        tools: TOOLS_CONFIG.tools,
        systemPrompt: TOOLS_CONFIG.systemPrompt
    });
});

/**
 * GET /agent/prompts/:mode
 * Get system prompt for mode (fast or planning)
 */
router.get('/prompts/:mode', (req, res) => {
    const { mode } = req.params;

    const prompts = {
        fast: `You are DRAPE AI, an autonomous development agent in FAST MODE.

## APPROACH
Move fast and iterate. Execute immediately, fix errors as they occur.

## TOOLS AVAILABLE
- write_file: Create/overwrite files
- read_file: Read file contents
- list_directory: Explore structure
- run_command: Execute shell commands
- edit_file: Modify files
- signal_completion: Signal done (REQUIRED at end)

## CONTENT RULES
- NO placeholders ("Product 1", "Lorem ipsum")
- Use realistic, industry-specific content
- Professional UI design
- Mobile-responsive layouts

## PROJECT STRUCTURE (React + Vite)
- index.html at root
- package.json with dependencies
- vite.config.js
- src/main.jsx, src/App.jsx, src/index.css

Call signal_completion when done.`,

        planning: `You are DRAPE AI, an autonomous development agent in PLANNING MODE.

## APPROACH
Create a detailed plan BEFORE executing. Analyze requirements thoroughly.

## PHASE 1: PLANNING
1. Analyze the user's request
2. Identify all requirements
3. Design architecture and file structure
4. List all files to create
5. Present plan for approval

## PHASE 2: EXECUTION (after approval)
Execute the plan step by step.

## TOOLS AVAILABLE
- write_file, read_file, list_directory, run_command, edit_file
- signal_completion (REQUIRED at end)

Create your plan first, then wait for approval before executing.`
    };

    res.json({
        mode,
        systemPrompt: prompts[mode] || prompts.fast
    });
});

/**
 * POST /agent/execute-tool
 * Execute a single tool on the VM
 */
router.post('/execute-tool', async (req, res) => {
    const { projectId, tool, input } = req.body;

    if (!projectId || !tool || !input) {
        return res.status(400).json({ error: 'projectId, tool, and input are required' });
    }

    try {
        // Get VM
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);
        const { agentUrl, machineId } = vmInfo;

        // Execute tool
        const result = await executeTool(tool, input, agentUrl, machineId, projectId);

        res.json(result);
    } catch (error) {
        console.error('Tool execution error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /agent/create-project
 * Build prompt for project creation
 */
router.post('/create-project', (req, res) => {
    const { name, description, technology = 'React + Vite', mode = 'fast' } = req.body;

    if (!name || !description) {
        return res.status(400).json({ error: 'name and description are required' });
    }

    const prompt = `Create a ${technology} project called "${name}".

## Description
${description}

## Requirements
1. Complete project structure
2. Modern, professional UI design
3. Realistic content (NO placeholders like "Product 1", "Lorem ipsum")
4. Mobile-responsive
5. Clean code

## Success Criteria
- All files created
- npm install works
- npm run dev starts server
- All pages render

## Process
1. Create package.json with dependencies
2. Create vite.config.js
3. Create index.html at root
4. Create src/main.jsx, App.jsx
5. Create styles (index.css)
6. Create components
7. Create pages
8. Run npm install
9. Call signal_completion

Start now.`;

    res.json({
        prompt,
        mode,
        technology,
        projectName: name
    });
});

/**
 * GET /agent/status
 * Get agent status and capabilities
 */
router.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        modes: ['fast', 'planning', 'executing'],
        tools: TOOLS_CONFIG.tools.map(t => t.function.name)
    });
});

/**
 * GET/POST /agent/run/fast
 * Run agent loop in fast mode with SSE streaming
 */
const runFastHandler = async (req, res) => {
    // Support both GET (query params) and POST (body)
    const { prompt, projectId, model, conversationHistory, images, userId, userPlan } = req.method === 'GET' ? req.query : req.body;

    if (!prompt || !projectId) {
        return res.status(400).json({ error: 'prompt and projectId are required' });
    }

    // Parse conversation history if provided (might be JSON string from GET)
    let history = [];
    if (conversationHistory) {
        try {
            history = typeof conversationHistory === 'string'
                ? JSON.parse(conversationHistory)
                : conversationHistory;
        } catch (e) {
            console.warn('[Agent] Failed to parse conversationHistory:', e);
        }
    }

    // Parse images if provided
    let imagesList = [];
    if (images) {
        try {
            imagesList = typeof images === 'string'
                ? JSON.parse(images)
                : images;
            console.log(`[Agent] Received ${imagesList.length} images for multimodal processing`);
        } catch (e) {
            console.warn('[Agent] Failed to parse images:', e);
        }
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send keep-alive comment
    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 15000);

    try {
        // Create and initialize agent loop with selected model and conversation history
        // Force reload to get latest code changes
        const { AgentLoop } = getAgentLoop();
        const agent = new AgentLoop(projectId, 'fast', model, history, userId, userPlan || 'free');
        await agent.initialize();

        // Run the loop and stream events (with images if provided)
        for await (const event of agent.run(prompt, imagesList)) {
            // SSE format: event type + data
            res.write(`event: ${event.type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);

            // If client disconnected, stop
            if (res.writableEnded) {
                break;
            }
        }

    } catch (error) {
        console.error('Agent loop error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'fatal_error',
            error: error.message,
            timestamp: new Date().toISOString()
        })}\n\n`);
    } finally {
        clearInterval(keepAlive);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }
};

// Register both GET and POST for fast mode
router.get('/run/fast', runFastHandler);
router.post('/run/fast', runFastHandler);

/**
 * GET/POST /agent/run/plan
 * Run agent loop in planning mode with SSE streaming
 * Returns a plan for user approval
 */
const runPlanHandler = async (req, res) => {
    // Support both GET (query params) and POST (body)
    const { prompt, projectId, model, conversationHistory, images, userId, userPlan } = req.method === 'GET' ? req.query : req.body;

    if (!prompt || !projectId) {
        return res.status(400).json({ error: 'prompt and projectId are required' });
    }

    // Parse conversation history if provided (might be JSON string from GET)
    let history = [];
    if (conversationHistory) {
        try {
            history = typeof conversationHistory === 'string'
                ? JSON.parse(conversationHistory)
                : conversationHistory;
        } catch (e) {
            console.warn('[Agent] Failed to parse conversationHistory:', e);
        }
    }

    // Parse images if provided
    let imagesList = [];
    if (images) {
        try {
            imagesList = typeof images === 'string'
                ? JSON.parse(images)
                : images;
            console.log(`[Agent] Received ${imagesList.length} images for multimodal processing`);
        } catch (e) {
            console.warn('[Agent] Failed to parse images:', e);
        }
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 15000);

    try {
        // Create and initialize agent loop in planning mode with selected model and conversation history
        // Force reload to get latest code changes
        const { AgentLoop } = getAgentLoop();
        const agent = new AgentLoop(projectId, 'planning', model, history, userId, userPlan || 'free');
        await agent.initialize();

        // Run the loop and stream events (with images if provided)
        for await (const event of agent.run(prompt, imagesList)) {
            // SSE format: event type + data
            res.write(`event: ${event.type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);

            // Store plan if created
            if (event.type === 'plan_ready' && event.plan) {
                approvedPlans.set(projectId, {
                    plan: event.plan,
                    prompt,
                    model,  // Save selected model with plan
                    createdAt: new Date().toISOString()
                });
            }

            if (res.writableEnded) break;
        }

    } catch (error) {
        console.error('Agent planning error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'fatal_error',
            error: error.message,
            timestamp: new Date().toISOString()
        })}\n\n`);
    } finally {
        clearInterval(keepAlive);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }
};

// Register both GET and POST for plan mode
router.get('/run/plan', runPlanHandler);
router.post('/run/plan', runPlanHandler);

/**
 * GET/POST /agent/run/execute
 * Execute an approved plan with SSE streaming
 */
const runExecuteHandler = async (req, res) => {
    // Support both GET (query params) and POST (body)
    const { projectId, model, userId, userPlan } = req.method === 'GET' ? req.query : req.body;

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    // Get approved plan
    const planData = approvedPlans.get(projectId);
    if (!planData) {
        return res.status(404).json({ error: 'No approved plan found. Run /agent/run/plan first.' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 15000);

    try {
        // Create agent in executing mode with the plan and selected model
        // Force reload to get latest code changes
        const { AgentLoop } = getAgentLoop();
        const agent = new AgentLoop(projectId, 'executing', model || planData.model, [], userId, userPlan || 'free');
        agent.lastPlan = planData.plan;
        await agent.initialize();

        // Build execution prompt
        const executePrompt = `Execute the following approved plan:

${JSON.stringify(planData.plan, null, 2)}

Original request: "${planData.prompt}"

Execute each step in order. Call signal_completion when done.`;

        // Run the loop
        for await (const event of agent.run(executePrompt)) {
            // SSE format: event type + data
            res.write(`event: ${event.type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);

            // Clear plan after successful completion
            if (event.type === 'complete') {
                approvedPlans.delete(projectId);
            }

            if (res.writableEnded) break;
        }

    } catch (error) {
        console.error('Agent execution error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'fatal_error',
            error: error.message,
            timestamp: new Date().toISOString()
        })}\n\n`);
    } finally {
        clearInterval(keepAlive);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }
};

// Register both GET and POST for execute mode
router.get('/run/execute', runExecuteHandler);
router.post('/run/execute', runExecuteHandler);

/**
 * POST /agent/approve-plan
 * Approve a plan for execution (alternative to SSE execute)
 */
router.post('/approve-plan', (req, res) => {
    const { projectId, approved } = req.body;

    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }

    const planData = approvedPlans.get(projectId);
    if (!planData) {
        return res.status(404).json({ error: 'No pending plan found' });
    }

    if (approved === false) {
        approvedPlans.delete(projectId);
        return res.json({ success: true, message: 'Plan rejected' });
    }

    res.json({
        success: true,
        message: 'Plan approved. Call POST /agent/run/execute to execute.',
        plan: planData.plan
    });
});

/**
 * GET /agent/plan/:projectId
 * Get pending plan for a project
 */
router.get('/plan/:projectId', (req, res) => {
    const { projectId } = req.params;
    const planData = approvedPlans.get(projectId);

    if (!planData) {
        return res.status(404).json({ error: 'No pending plan' });
    }

    res.json({
        success: true,
        plan: planData.plan,
        prompt: planData.prompt,
        createdAt: planData.createdAt
    });
});

/**
 * POST /agent/save-context
 * Save project context to .drape/project.json
 */
router.post('/save-context', async (req, res) => {
    const { projectId, name, description, technology } = req.body;

    if (!projectId || !description) {
        return res.status(400).json({ error: 'projectId and description are required' });
    }

    try {
        const context = await saveProjectContext(projectId, {
            name: name || projectId,
            description,
            technology: technology || 'react'
        });

        res.json({
            success: true,
            context,
            industry: context?.industry,
            features: context?.features
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /agent/context/:projectId
 * Get project context from .drape/project.json
 */
router.get('/context/:projectId', async (req, res) => {
    const { projectId } = req.params;

    try {
        const vmInfo = await workspaceOrchestrator.getOrCreateVM(projectId);
        const result = await flyService.exec(
            vmInfo.agentUrl,
            'cat /home/coder/project/.drape/project.json',
            '/home/coder/project',
            vmInfo.machineId,
            5000
        );

        if (result.exitCode !== 0) {
            return res.status(404).json({ error: 'No project context found' });
        }

        const context = JSON.parse(result.stdout);
        res.json({ success: true, context });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /agent/detect-industry
 * Utility endpoint to detect industry from description
 */
router.post('/detect-industry', (req, res) => {
    const { description } = req.body;

    if (!description) {
        return res.status(400).json({ error: 'description is required' });
    }

    res.json({
        industry: detectIndustry(description),
        features: extractFeatures(description)
    });
});

/**
 * POST /agent/stream
 * Unified streaming endpoint - dispatches to fast or plan mode based on mode param
 * This is the endpoint the frontend CreateProjectScreen uses
 */
router.post('/stream', async (req, res) => {
    const { projectId, mode = 'fast', prompt, model, conversationHistory, images, userId, userPlan } = req.body;

    if (!projectId || !prompt) {
        return res.status(400).json({ error: 'projectId and prompt are required' });
    }

    console.log(`\n🤖 [Agent] /stream called - projectId: ${projectId}, mode: ${mode}`);

    // Parse conversation history if provided
    let history = [];
    if (conversationHistory) {
        try {
            history = typeof conversationHistory === 'string'
                ? JSON.parse(conversationHistory)
                : conversationHistory;
        } catch (e) {
            console.warn('[Agent] Failed to parse conversationHistory:', e);
        }
    }

    // Parse images if provided
    let imagesList = [];
    if (images) {
        try {
            imagesList = typeof images === 'string'
                ? JSON.parse(images)
                : images;
            console.log(`[Agent] Received ${imagesList.length} images for multimodal processing`);
        } catch (e) {
            console.warn('[Agent] Failed to parse images:', e);
        }
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
    }, 15000);

    try {
        // Force reload to get latest code changes
        const { AgentLoop } = getAgentLoop();
        const agentMode = mode === 'planning' ? 'planning' : 'fast';
        const agent = new AgentLoop(projectId, agentMode, model, history, userId, userPlan || 'free');
        await agent.initialize();

        // Run the loop and stream events
        for await (const event of agent.run(prompt, imagesList)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);

            // Store plan if created (for planning mode)
            if (event.type === 'plan_ready' && event.plan) {
                approvedPlans.set(projectId, {
                    plan: event.plan,
                    prompt,
                    model,
                    createdAt: new Date().toISOString()
                });
            }

            if (res.writableEnded) break;
        }

    } catch (error) {
        console.error('[Agent] Stream error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'tool_error',
            error: error.message,
            timestamp: new Date().toISOString()
        })}\n\n`);
    } finally {
        clearInterval(keepAlive);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
    }
});

module.exports = router;
