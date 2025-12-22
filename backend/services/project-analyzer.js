/**
 * AI Project Analyzer Service
 * Uses Gemini to analyze project structure and determine how to run it
 */

const { getProviderForModel } = require('./ai-providers');
const { DEFAULT_AI_MODEL } = require('../utils/constants');

async function analyzeProjectWithAI(files, configFiles = {}) {
    console.log('🧠 AI analyzing project structure...');

    const prompt = `
You are an expert DevOps engineer and code analyst.
Analyze this project structure and configuration files to determine how to install dependencies and start the development server.

files:
${files.join('\n')}

Configuration Files Content:
${Object.entries(configFiles).map(([name, content]) => `--- ${name} ---\n${content}\n`).join('\n')}

Determine the following:
1. Project Type (e.g. React, Vue, Python Flask, Node Express, Go, etc.)
2. Install Command (e.g. 'npm install', 'pip install -r requirements.txt', 'go mod download')
3. Start Command (e.g. 'npm run dev', 'python app.py', 'go run main.go'). Prefer development servers that reload on change.
4. Default Port (e.g. 3000, 8080, 5000). Look for port configurations in the files.
5. Description (Short description of the stack).

IMPORTANT: 
- For 'Start Command', ensure it binds to 0.0.0.0 (host) if possible, so it's accessible externally.
- If it's a static site (HTML/CSS only), user 'python3 -m http.server 8080' or similar.

Return ONLY a JSON object in this format (no markdown):
{
  "type": "string_id",
  "description": "Human readable description",
  "installCommand": "bash command",
  "startCommand": "bash command",
  "defaultPort": integer
}
`;

    try {
        const { provider, modelId } = getProviderForModel(DEFAULT_AI_MODEL);

        if (!provider.client) {
            await provider.initialize();
        }

        let responseText = '';
        // We use chatStream but gather full response
        for await (const chunk of provider.chatStream([{ role: 'user', content: prompt }], { model: modelId })) {
            if (chunk.type === 'text') {
                responseText += chunk.text;
            }
        }

        // Clean cleanup markdown if present
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const json = JSON.parse(jsonMatch[0]);
            // Validate port is number
            if (json.defaultPort) json.defaultPort = parseInt(json.defaultPort);
            return json;
        } else {
            throw new Error('No JSON found in AI response');
        }

    } catch (error) {
        console.error('❌ AI Analysis failed:', error);
        return null; // Fallback to static detection
    }
}

module.exports = { analyzeProjectWithAI };
