/**
 * AI Chat Routes
 * AI-powered chat with tool support
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody, schema, commonSchemas } = require('../middleware/validator');
const { getProviderForModel, standardTools, getAvailableModels } = require('../services/ai-providers');
const { executeTool, createContext } = require('../services/tool-executor');
const { AI_MODELS, DEFAULT_AI_MODEL } = require('../utils/constants');

/**
 * GET /ai/models
 * List available AI models
 */
router.get('/models', (req, res) => {
    const models = getAvailableModels();
    res.json({
        success: true,
        models,
        default: DEFAULT_AI_MODEL
    });
});

/**
 * POST /ai/chat
 * AI chat with streaming and tool support
 */
router.post('/chat', asyncHandler(async (req, res) => {
    const {
        prompt,
        conversationHistory = [],
        workstationId,
        projectId,
        repositoryUrl,
        selectedModel = DEFAULT_AI_MODEL,
        context: userContext,
        username // Extract username explicitly
    } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }

    console.log(`\n🤖 AI Chat Request`);
    console.log(`   Model: ${selectedModel}`);
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
    console.log(`   Project: ${projectId || workstationId || 'none'}`);
    console.log(`   User: ${username || 'admin (default)'}`);

    // Get provider for selected model
    const { provider, modelId, config } = getProviderForModel(selectedModel);

    // Initialize provider if needed
    if (!provider.client && provider.isAvailable()) {
        await provider.initialize();
    }

    // Create execution context (Multi-User safe)
    // Enable Holy Grail mode for projects in Firestore (template + cloned)
    const effectiveProjectId = projectId || workstationId;
    const execContext = effectiveProjectId ? createContext(effectiveProjectId, {
        owner: username,
        isHolyGrail: true  // Always use Holy Grail for AI-managed projects
    }) : null;

    // Fetch project files to include in context (from Firestore OR VM)
    let projectFiles = [];
    let projectFilesContent = {};
    if (effectiveProjectId) {
        try {
            const storageService = require('../services/storage-service');
            const orchestrator = require('../services/workspace-orchestrator');

            // First try Firestore storage
            const { files } = await storageService.listFiles(effectiveProjectId);
            projectFiles = files || [];

            // If no files in Firestore, try to get from VM (for cloned projects)
            if (projectFiles.length === 0) {
                console.log(`   📁 No files in Firestore, checking VM...`);
                try {
                    const vm = orchestrator.getVM(effectiveProjectId);
                    if (vm && vm.agentUrl) {
                        const axios = require('axios');
                        // Get file list from VM
                        const listRes = await axios.get(`${vm.agentUrl}/files`, { timeout: 5000 });
                        if (listRes.data && listRes.data.files) {
                            projectFiles = listRes.data.files.map(f => ({
                                path: f.path || f,
                                size: f.size || 0
                            }));

                            // Read contents from VM for small files
                            for (const file of projectFiles.slice(0, 20)) {
                                try {
                                    const fileRes = await axios.get(`${vm.agentUrl}/file`, {
                                        params: { path: file.path },
                                        timeout: 5000
                                    });
                                    if (fileRes.data && fileRes.data.content) {
                                        projectFilesContent[file.path] = fileRes.data.content;
                                    }
                                } catch (e) {
                                    // Skip files that can't be read
                                }
                            }
                            console.log(`   📁 Loaded ${projectFiles.length} files from VM, ${Object.keys(projectFilesContent).length} with content`);
                        }
                    }
                } catch (vmError) {
                    console.warn('Could not load files from VM:', vmError.message);
                }
            } else {
                // Files found in Firestore, read their contents
                for (const file of projectFiles.slice(0, 20)) {
                    if (!file.size || file.size < 50000) {
                        const result = await storageService.readFile(effectiveProjectId, file.path);
                        if (result.success) {
                            projectFilesContent[file.path] = result.content;
                        }
                    }
                }
                console.log(`   📁 Loaded ${projectFiles.length} files from Firestore, ${Object.keys(projectFilesContent).length} with content`);
            }
        } catch (e) {
            console.warn('Could not load project files:', e.message);
        }
    }

    // Build system message with Italian language and files
    const systemMessage = buildSystemMessage(execContext, userContext, projectFiles, projectFilesContent);

    // Build messages array
    const messages = [
        { role: 'system', content: systemMessage }
    ];

    // Add conversation history
    if (conversationHistory.length > 0) {
        for (const msg of conversationHistory.slice(-10)) { // Keep last 10 messages
            if (msg.role === 'user' || msg.type === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'assistant' || msg.type === 'text') {
                messages.push({ role: 'assistant', content: msg.content });
            }
        }
    }

    // Add current prompt
    messages.push({ role: 'user', content: prompt });

    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Prepare tools if project context exists
    const tools = execContext && config.supportsTools ? standardTools : [];

    // Streaming loop with tool execution
    let continueLoop = true;
    let loopCount = 0;
    const MAX_LOOPS = 10;
    let currentMessages = [...messages];

    while (continueLoop && loopCount < MAX_LOOPS) {
        loopCount++;

        try {
            let fullText = '';
            let toolCalls = [];

            // Stream response
            for await (const chunk of provider.chatStream(currentMessages, {
                model: modelId,
                tools,
                maxTokens: config.maxTokens || 8192
            })) {
                if (chunk.type === 'text') {
                    fullText += chunk.text;
                    res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
                } else if (chunk.type === 'tool_start') {
                    res.write(`data: ${JSON.stringify({ type: 'tool_start', tool: chunk.name })}\n\n`);
                } else if (chunk.type === 'tool_call') {
                    toolCalls.push(chunk.toolCall);
                    res.write(`data: ${JSON.stringify({
                        type: 'tool_input',
                        tool: chunk.toolCall.name,
                        input: chunk.toolCall.input
                    })}\n\n`);
                } else if (chunk.type === 'done') {
                    if (chunk.toolCalls) toolCalls = chunk.toolCalls;
                }
            }

            // Handle tool calls
            if (toolCalls.length > 0 && execContext) {
                // Add assistant response to messages
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

                // Execute tools and send results in the format frontend expects
                const toolResults = [];
                for (const tc of toolCalls) {
                    console.log(`🔧 Executing: ${tc.name}`);

                    // Send functionCall event (for "Executing..." indicator)
                    res.write(`data: ${JSON.stringify({
                        functionCall: {
                            name: tc.name,
                            args: tc.input
                        }
                    })}\n\n`);

                    const result = await executeTool(tc.name, tc.input, execContext);

                    const isSuccess = result.startsWith('✅') ||
                        (result.length > 0 && !result.startsWith('❌'));

                    // Send toolResult event with full data (for formatted output)
                    res.write(`data: ${JSON.stringify({
                        toolResult: {
                            name: tc.name,
                            args: tc.input,
                            result: result,
                            success: isSuccess
                        }
                    })}\n\n`);

                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: tc.id,
                        tool: tc.name,
                        content: result
                    });
                }

                currentMessages.push({ role: 'user', content: toolResults });
                // Continue loop for AI to respond to tool results
            } else {
                // No tool calls, we're done
                continueLoop = false;
            }
        } catch (error) {
            console.error('AI stream error:', error);
            res.write(`data: ${JSON.stringify({ text: `\n❌ Errore: ${error.message}` })}\n\n`);
            continueLoop = false;
        }
    }

    res.write('data: [DONE]\n\n');
    res.end();
}));

/**
 * Build system message for AI (in Italian, with project files, technology awareness, and design guidelines)
 */
function buildSystemMessage(execContext, userContext, projectFiles = [], projectFilesContent = {}) {
    // Detect project technology from files
    let technology = 'generico';
    const filePaths = projectFiles.map(f => f.path);
    const hasPackageJson = filePaths.some(p => p === 'package.json');
    const hasViteConfig = filePaths.some(p => p.includes('vite.config'));
    const hasJSX = filePaths.some(p => p.endsWith('.jsx') || p.endsWith('.tsx'));
    const hasVue = filePaths.some(p => p.endsWith('.vue'));
    const hasAngular = filePaths.some(p => p.includes('angular.json'));
    const hasPython = filePaths.some(p => p.endsWith('.py'));

    if (hasJSX || (hasPackageJson && projectFilesContent['package.json']?.includes('react'))) {
        technology = 'react';
    } else if (hasVue) {
        technology = 'vue';
    } else if (hasAngular) {
        technology = 'angular';
    } else if (hasPython) {
        technology = 'python';
    } else if (filePaths.some(p => p === 'index.html') && !hasPackageJson) {
        technology = 'html';
    }

    let systemMessage = `Sei un assistente di programmazione esperto e un DESIGNER UI/UX di alto livello.
Aiuti gli utenti a creare applicazioni web BELLISSIME e moderne.
Rispondi SEMPRE in italiano.

🎨 LINEE GUIDA DI DESIGN OBBLIGATORIE:
Quando crei interfacce web, DEVI seguire queste regole per creare design PREMIUM e moderni:

1. PALETTE COLORI MODERNE:
   - USA gradienti eleganti (es: linear-gradient(135deg, #667eea 0%, #764ba2 100%))
   - Preferisci dark mode con sfondi scuri (#0d0d0f, #1a1a2e, #16213e)
   - Usa colori accent vibranti (#00d9ff, #ff6b6b, #4ecdc4, #a855f7)
   - MAI usare colori base come "red", "blue", "green" - usa valori HEX/HSL sofisticati
   
2. TIPOGRAFIA PREMIUM:
   - Usa Google Fonts: Inter, Outfit, Poppins, Space Grotesk, Manrope
   - Aggiungi: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
   - Font sizes gerarchici: titoli grandi (2.5-4rem), sottotitoli (1.2-1.5rem), body (1rem)
   - Line-height generoso: 1.5-1.7 per leggibilità
   
3. EFFETTI VISIVI MODERNI:
   - Glassmorphism: background: rgba(255,255,255,0.05); backdrop-filter: blur(10px);
   - Ombre soft: box-shadow: 0 8px 32px rgba(0,0,0,0.3);
   - Border radius generosi: 12px-24px per card, 8px per bottoni
   - Border sottili: border: 1px solid rgba(255,255,255,0.1);
   
4. ANIMAZIONI E MICRO-INTERAZIONI:
   - Tutti i bottoni DEVONO avere :hover con transform e transizione
   - Usa: transition: all 0.3s ease;
   - Hover effects: transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,0.4);
   - Scale su hover per card: transform: scale(1.02);
   
5. LAYOUT RESPONSIVE:
   - Usa Flexbox e CSS Grid
   - Gap generosi: 1.5rem-3rem tra elementi
   - Padding abbondante: 2rem-4rem nelle sezioni
   - Max-width per contenuti: 1200px-1400px con margin: 0 auto;
   
6. COMPONENTI PREMIUM:
   - Hero sections con gradiente di sfondo e testo grande
   - Card con hover effects e ombre
   - Bottoni con gradienti o colori accent + hover states
   - Input fields con bordi arrotondati e focus states
   - Navbar con blur effect (glassmorphism)

⚠️ COSA EVITARE ASSOLUTAMENTE:
- Design piatti e noiosi senza gradienti o ombre
- Sfondi bianchi puri (#fff) - usa almeno off-white o dark mode
- Testi neri puri (#000) - usa grigi scuri (#1a1a1a, #333)
- Bottoni senza hover effects
- Font di sistema senza Google Fonts
- Layout senza spaziature adeguate
- Placeholder images rotte - usa Unsplash o gradienti

ESEMPIO DI STILE CSS MODERNO:
\`\`\`css
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', sans-serif;
  background: linear-gradient(135deg, #0d0d0f 0%, #1a1a2e 100%);
  color: #e0e0e0;
  min-height: 100vh;
}
.container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
.card {
  background: rgba(255,255,255,0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 2rem;
  transition: all 0.3s ease;
}
.card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
.btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}
.btn:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(102,126,234,0.4); }
\`\`\`

`;

    if (execContext) {
        systemMessage += `
CONTESTO DEL PROGETTO:
- ID Progetto: ${execContext.projectId}
- Tecnologia: ${technology.toUpperCase()}
- Ambiente: ${execContext.isCloud ? 'Cloud Workspace' : 'Locale'}
- Percorso: ${execContext.projectPath}
`;

        // Add technology-specific instructions
        if (technology === 'react') {
            systemMessage += `
⚛️ QUESTO È UN PROGETTO REACT!
- Modifica SOLO i file .jsx o .tsx esistenti (come src/App.jsx)
- NON creare file HTML separati - usa i componenti React
- Per stili: usa CSS-in-JS con oggetti style o modifica src/index.css
- Applica TUTTE le linee guida di design sopra usando oggetti style in React
- Esempio React con stile moderno:
  const buttonStyle = {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '8px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  };
`;
        } else if (technology === 'vue') {
            systemMessage += `
💚 QUESTO È UN PROGETTO VUE!
- Modifica i file .vue esistenti
- NON creare file HTML separati - usa i componenti Vue
- Usa la sintassi <template>, <script>, <style>
- Applica le linee guida di design nella sezione <style>
`;
        } else if (technology === 'html') {
            systemMessage += `
🌐 QUESTO È UN PROGETTO HTML STATICO
- Modifica index.html per la struttura
- Modifica style.css per gli stili - APPLICA TUTTE LE LINEE GUIDA DI DESIGN!
- Aggiungi Google Fonts nel <head>
`;
        }

        // Add project files list
        if (projectFiles.length > 0) {
            systemMessage += `\nFILE DEL PROGETTO (${projectFiles.length} file):\n`;
            for (const file of projectFiles) {
                systemMessage += `- ${file.path} (${file.size || '?'} bytes)\n`;
            }
        }

        // Add file contents for small files
        const contentEntries = Object.entries(projectFilesContent);
        if (contentEntries.length > 0) {
            systemMessage += `\nCONTENUTO DEI FILE:\n`;
            for (const [filePath, content] of contentEntries) {
                const ext = filePath.split('.').pop();
                systemMessage += `\n--- ${filePath} ---\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
            }
        }

        systemMessage += `
Hai accesso a questi tool per operazioni sui file:
- read_file: Legge il contenuto di un file
- write_file: Crea o sovrascrive file (PREFERISCI questo per riscrivere file interi)
- edit_file: Modifica file con cerca/sostituisci (usa per piccole modifiche)
- glob_files: Trova file per pattern
- search_in_files: Cerca contenuto nei file
- execute_command: Esegue comandi shell

Quando l'utente chiede qualcosa sul progetto, hai già i file caricati nel contesto.
IMPORTANTE: Rispetta la struttura del progetto E crea SEMPRE design BELLISSIMI e moderni!
`;
    }

    if (userContext) {
        systemMessage += `\nCONTESTO AGGIUNTIVO:\n${userContext}\n`;
    }

    return systemMessage;
}

/**
 * POST /ai/analyze
 * Quick code analysis without tools
 */
router.post('/analyze', asyncHandler(async (req, res) => {
    const { code, language, question } = req.body;

    if (!code || !question) {
        return res.status(400).json({ error: 'code and question are required' });
    }

    const { provider, modelId } = getProviderForModel('gemini-2.5-flash');

    if (!provider.client) {
        await provider.initialize();
    }

    const prompt = `Analyze this ${language || 'code'}:

\`\`\`${language || ''}
${code}
\`\`\`

Question: ${question}

Provide a clear, concise analysis.`;

    const messages = [{ role: 'user', content: prompt }];

    let response = '';
    for await (const chunk of provider.chatStream(messages, { model: modelId })) {
        if (chunk.type === 'text') response += chunk.text;
    }

    res.json({ success: true, analysis: response });
}));

module.exports = router;
