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
const contextService = require('../services/context-service'); // Import Singleton

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
        repositoryUrl, selectedModel = DEFAULT_AI_MODEL,
        context: userContext,
        username
    } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }

    console.log(`\n🤖 AI Chat Request (REST)`);
    console.log(`   Model: ${selectedModel}`);
    console.log(`   Prompt: ${prompt.substring(0, 50)}...`);
    console.log(`   Project: ${projectId || workstationId}`);

    // Get provider for selected model
    const { provider, modelId, config } = getProviderForModel(selectedModel);

    // Initialize provider if needed
    if (!provider.client && provider.isAvailable()) {
        await provider.initialize();
    }

    // Create execution context
    const effectiveProjectId = projectId || workstationId;
    const execContext = effectiveProjectId ? createContext(effectiveProjectId, {
        owner: username,
        isHolyGrail: true
    }) : null;

    // RAG Trigger: Ensure indexing triggers if not ready (fire & forget)
    if (effectiveProjectId) {
        const vectorStore = require('../services/vector-store');
        if (vectorStore.isReady) {
            // We don't await this to avoid latency, just ensure it's running/fresh
            vectorStore.indexProject(require('../utils/helpers').getRepoPath(effectiveProjectId), effectiveProjectId)
                .catch(e => console.error('RAG Index trigger failed:', e.message));
        }
    }

    // Restore Lightweight File Context (Map of the project)
    // This allows AI to "see" the file structure without reading content
    let projectFiles = [];
    if (effectiveProjectId) {
        try {
            const storageService = require('../services/storage-service');
            const { files } = await storageService.listFiles(effectiveProjectId);
            if (files) {
                projectFiles = files.map(f => ({ path: f.path, size: f.size }));
                console.log(`   📂 Loaded file tree map: ${projectFiles.length} files`);
            }
        } catch (e) {
            console.warn('Could not load project file tree:', e.message);
        }
    }

    // Build base system message (Personality + Design Rules + File Tree)
    // We pass projectFiles (list) but NO content (empty obj)
    const systemMessage = buildSystemMessage(execContext, userContext, projectFiles, {});

    // Context Engine Optimization
    let historyMessages = [];
    try {
        // This handles: Sanitization, Truncation, Summarization, and RAG Injection
        historyMessages = await contextService.optimizeContext(conversationHistory, modelId, prompt);
        console.log(`🧠 Context optimized: ${conversationHistory.length} -> ${historyMessages.length} messages`);
    } catch (error) {
        console.error('⚠️ Context optimization failed, falling back:', error);
        historyMessages = conversationHistory.slice(-10).map(msg => ({
            role: (msg.role === 'user' || msg.type === 'user') ? 'user' : 'assistant',
            content: msg.content
        }));
    }

    // Assemble final prompt
    const messages = [
        { role: 'system', content: systemMessage },
        ...historyMessages,
        { role: 'user', content: prompt }
    ];



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
            console.log(`🤖 Streaming from provider (Loop ${loopCount})...`);
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
- create_folder: Crea una nuova cartella/directory
- delete_file: Elimina un file o una cartella
- list_directory: Elenca contenuti di una directory con dimensioni e tipi
- move_file: Sposta o rinomina file/cartelle
- copy_file: Copia file/cartelle in una nuova posizione
- web_fetch: Recupera contenuti da un URL
- think: Ragiona passo-passo su problemi complessi

Quando l'utente chiede qualcosa sul progetto, hai già i file caricati nel contesto.
IMPORTANTE: Rispetta la struttura del progetto E crea SEMPRE design BELLISSIMI e moderni!
`;
    }

    if (userContext) {
        systemMessage += `\nCONTESTO AGGIUNTIVO:\n${userContext}\n`;
    }

    systemMessage += `
🚀 MODALITÀ AGENTE AUTONOMO (MASSIMA PRIORITÀ):
1. **NON CHIEDERE MAI IL PERMESSO** per fare modifiche ovvie o richieste dall'utente.
2. **AGISCI DIRETTAMENTE**: Se l'utente dice "cambia il footer", TU LEGGI IL FILE, MODIFICHI IL FILE E MOSTRI IL RISULTATO. Non dire "posso farlo?", FALLO.
3. **SII AUDACE**: Se il design non è specificato, prendi decisioni creative per renderlo "Wow". Non chiedere "quale colore preferisci?", scegli il migliore e applicalo.
4. Usa i tool (write_file, edit_file) IMMEDIATAMENTE.
5. Minimizza le chiacchiere, massimizza il CODICE SCRITTO.
6. **VIETATO SOLO "PIANIFICARE"**: Non rispondere MAI "Aggiungerò un footer..." senza chiamare contestualmente il tool per farlo. Se sai cosa fare, FALLO SUBITO.
`;

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

/**
 * POST /ai/recommend
 * AI-powered technology recommendation based on project description
 */
router.post('/recommend', asyncHandler(async (req, res) => {
    const { description } = req.body;

    if (!description) {
        return res.status(400).json({ error: 'description is required' });
    }

    console.log('🤖 AI Recommendation Request for:', description.substring(0, 50) + '...');

    const { provider, modelId } = getProviderForModel('gemini-2.5-flash');

    if (!provider.client) {
        await provider.initialize();
    }

    const prompt = `Based on this project description, recommend the BEST technology stack from this list:
- javascript: Pure JavaScript for simple interactive sites
- typescript: TypeScript for type-safe applications
- python: Python for data science, ML, automation, backend
- react: React for modern single-page applications
- node: Node.js for backend APIs and servers
- cpp: C++ for high-performance systems
- java: Java for enterprise applications
- swift: Swift for iOS applications
- kotlin: Kotlin for Android applications
- go: Go for scalable backend services
- rust: Rust for systems programming
- html: HTML/CSS for simple static websites

Project description: "${description}"

Respond with ONLY the technology ID (e.g., "react", "python", "html") - nothing else. Choose the most appropriate one based on:
1. Project complexity (simple static sites = html, complex apps = react/python)
2. Type of application (web app, mobile, backend, data science)
3. Scalability needs
4. Modern best practices`;

    const messages = [{ role: 'user', content: prompt }];

    let response = '';
    for await (const chunk of provider.chatStream(messages, { model: modelId })) {
        if (chunk.type === 'text') response += chunk.text;
    }

    // Clean up response - extract just the tech ID
    const recommendation = response.trim().toLowerCase();

    // Valid tech IDs from the list
    const validTechs = ['javascript', 'typescript', 'python', 'react', 'node', 'cpp', 'java', 'swift', 'kotlin', 'go', 'rust', 'html'];

    // Find the first valid tech in the response
    let finalRecommendation = validTechs.find(tech => recommendation.includes(tech));

    if (!finalRecommendation) {
        // Default fallback based on keywords
        if (description.toLowerCase().includes('landing') || description.toLowerCase().includes('semplice') || description.toLowerCase().includes('static')) {
            finalRecommendation = 'html';
        } else if (description.toLowerCase().includes('app') || description.toLowerCase().includes('web')) {
            finalRecommendation = 'react';
        } else {
            finalRecommendation = 'javascript';
        }
    }

    console.log('✅ AI Recommended:', finalRecommendation);

    res.json({
        success: true,
        recommendation: finalRecommendation,
        rawResponse: response
    });
}));

module.exports = router;
