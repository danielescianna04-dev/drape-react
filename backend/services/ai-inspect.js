/**
 * AI Inspect Service
 * AI-powered analysis of UI elements and code suggestions
 * 
 * IMPROVEMENTS:
 * - Cleaner tool execution
 * - Better context building
 * - Streaming responses
 */

const { getProviderForModel, standardTools } = require('./ai-providers');
const { executeTool, createContext } = require('./tool-executor');
const { DEFAULT_AI_MODEL } = require('../utils/constants');

/**
 * System message for inspect mode
 */
const INSPECT_SYSTEM_MESSAGE = `Sei un esperto sviluppatore UI/UX che analizza elementi selezionati in un'app web.

RISPONDI SEMPRE IN ITALIANO.

Il tuo compito: Analizza l'elemento selezionato e aiuta l'utente a modificarlo.

REGOLE:
1. Usa glob_files per trovare i file rilevanti (componenti, stili, ecc.)
2. Usa read_file per esaminare il codice
3. Identifica dove l'elemento è definito e stilizzato
4. Usa edit_file per applicare le modifiche richieste
5. Sii diretto e conciso nelle risposte

Quando modifichi:
- Sii preciso con le modifiche ai file
- Mantieni lo stile del codice esistente
- Dopo ogni modifica, conferma cosa hai fatto`;


/**
 * Analyze a UI element and suggest modifications
 */
async function inspectElement({
    description,
    userPrompt,
    elementInfo,
    screenshot,
    projectId,
    selectedModel = 'gemini-2.5-flash'
}) {
    console.log(`\n🔍 AI Inspect: "${description}"`);
    console.log(`   User: ${userPrompt?.substring(0, 50)}...`);
    console.log(`   Project: ${projectId}`);

    const { provider, modelId, config } = getProviderForModel(selectedModel);

    if (!provider.client && provider.isAvailable()) {
        await provider.initialize();
    }

    const context = createContext(projectId);

    // Build the analysis prompt
    let analysisPrompt = `The user selected this element: ${description}\n\n`;

    if (elementInfo) {
        analysisPrompt += `Element details:
- Type: ${elementInfo.type || 'unknown'}
- Text: ${elementInfo.text || 'none'}
- Position: ${elementInfo.x}, ${elementInfo.y}
- Size: ${elementInfo.width}x${elementInfo.height}
`;
    }

    if (userPrompt) {
        analysisPrompt += `\nUser request: ${userPrompt}\n`;
    } else {
        analysisPrompt += `\nPlease analyze this element and identify:
1. Where it's defined in the codebase
2. How it's styled
3. How it could be modified\n`;
    }

    const messages = [
        { role: 'system', content: INSPECT_SYSTEM_MESSAGE },
        { role: 'user', content: analysisPrompt }
    ];

    // Execute with tools
    const tools = config.supportsTools ? standardTools : [];
    let currentMessages = [...messages];
    let continueLoop = true;
    let loopCount = 0;
    const MAX_LOOPS = 8;

    const results = {
        text: '',
        toolsUsed: [],
        filesModified: [],
        filesRead: []
    };

    while (continueLoop && loopCount < MAX_LOOPS) {
        loopCount++;

        let fullText = '';
        let toolCalls = [];

        for await (const chunk of provider.chatStream(currentMessages, {
            model: modelId,
            tools,
            maxTokens: config.maxTokens || 8192
        })) {
            if (chunk.type === 'text') {
                fullText += chunk.text;
                results.text += chunk.text;
            } else if (chunk.type === 'tool_call') {
                toolCalls.push(chunk.toolCall);
            } else if (chunk.type === 'done' && chunk.toolCalls) {
                toolCalls = chunk.toolCalls;
            }
        }

        if (toolCalls.length > 0) {
            const assistantContent = [];
            if (fullText) assistantContent.push({ type: 'text', text: fullText });

            for (const tc of toolCalls) {
                assistantContent.push({
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.name,
                    input: tc.input
                });

                results.toolsUsed.push({ name: tc.name, input: tc.input });

                // Track file operations
                if (tc.input.filePath) {
                    if (tc.name === 'read_file') {
                        results.filesRead.push(tc.input.filePath);
                    } else if (tc.name === 'write_file' || tc.name === 'edit_file') {
                        results.filesModified.push(tc.input.filePath);
                    }
                }
            }

            currentMessages.push({ role: 'assistant', content: assistantContent });

            const toolResults = [];
            for (const tc of toolCalls) {
                console.log(`   🔧 ${tc.name}: ${JSON.stringify(tc.input).substring(0, 50)}`);
                const result = await executeTool(tc.name, tc.input, context);

                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tc.id,
                    tool: tc.name,
                    content: result
                });
            }

            currentMessages.push({ role: 'user', content: toolResults });
        } else {
            continueLoop = false;
        }
    }

    console.log(`   ✅ Inspect complete. Tools: ${results.toolsUsed.length}, Files: ${results.filesRead.length}`);

    return results;
}

/**
 * Stream inspection results via SSE
 */
async function* streamInspectElement(params) {
    const {
        description,
        userPrompt,
        elementInfo,
        projectId,
        workstationId, // Add this
        username,      // Add this
        selectedModel = 'gemini-2.5-flash'
    } = params;

    console.log(`\n🔍 AI Inspect (streaming): "${description}"`);

    const { provider, modelId, config } = getProviderForModel(selectedModel);

    if (!provider.client && provider.isAvailable()) {
        await provider.initialize();
    }

    // Pass owner to context for multi-user support
    const context = createContext(projectId, { owner: username });

    let analysisPrompt = `The user selected this element: ${description}\n`;
    if (elementInfo) {
        analysisPrompt += `Element: ${elementInfo.type}, text: "${elementInfo.text || ''}", at (${elementInfo.x}, ${elementInfo.y})\n`;
    }
    if (userPrompt) {
        analysisPrompt += `User request: ${userPrompt}\n`;
    }

    const messages = [
        { role: 'system', content: INSPECT_SYSTEM_MESSAGE },
        { role: 'user', content: analysisPrompt }
    ];

    const tools = config.supportsTools ? standardTools : [];
    let currentMessages = [...messages];
    let continueLoop = true;
    let loopCount = 0;

    while (continueLoop && loopCount < 8) {
        loopCount++;

        let fullText = '';
        let toolCalls = [];

        for await (const chunk of provider.chatStream(currentMessages, {
            model: modelId,
            tools,
            maxTokens: config.maxTokens || 8192
        })) {
            if (chunk.type === 'text') {
                fullText += chunk.text;
                yield { type: 'text', text: chunk.text };
            } else if (chunk.type === 'tool_start') {
                yield { type: 'tool_start', tool: chunk.name };

            } else if (chunk.type === 'tool_call') {
                toolCalls.push(chunk.toolCall);
                yield { type: 'tool_input', tool: chunk.toolCall.name, input: chunk.toolCall.input };
            } else if (chunk.type === 'done' && chunk.toolCalls) {
                toolCalls = chunk.toolCalls;
            }
        }

        if (toolCalls.length > 0) {
            const assistantContent = [];
            if (fullText) assistantContent.push({ type: 'text', text: fullText });

            for (const tc of toolCalls) {
                assistantContent.push({
                    type: 'tool_use',
                    id: tc.id,
                    name: tc.name,
                    input: tc.input
                });
            }

            currentMessages.push({ role: 'assistant', content: assistantContent });

            const toolResults = [];
            for (const tc of toolCalls) {
                const result = await executeTool(tc.name, tc.input, context);
                const isSuccess = result.startsWith('✅') || !result.startsWith('❌');

                yield { type: 'tool_result', tool: tc.name, success: isSuccess };

                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tc.id,
                    tool: tc.name,
                    content: result
                });
            }

            currentMessages.push({ role: 'user', content: toolResults });
        } else {
            continueLoop = false;
        }
    }

    yield { type: 'done' };
}

module.exports = {
    inspectElement,
    streamInspectElement
};
