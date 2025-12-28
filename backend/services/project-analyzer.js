/**
 * AI Project Analyzer Service
 * Uses Gemini to analyze project structure and determine how to run it
 */

const { getProviderForModel } = require('./ai-providers');
const { DEFAULT_AI_MODEL } = require('../utils/constants');

/**
 * FAST PATH: Instant detection for common project types
 * Skips AI entirely for well-known patterns
 */
function fastDetect(files, configFiles) {
    const packageJson = configFiles['package.json'];

    // Check for package.json patterns
    if (packageJson) {
        try {
            const pkg = JSON.parse(packageJson);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const scripts = pkg.scripts || {};

            // React (Vite or CRA)
            if (deps.react) {
                if (deps.vite || scripts.dev?.includes('vite')) {
                    // Robust Vite allowedHosts patch using inline Node.js script
                    // This safely handles existing server blocks and avoids duplicates
                    const patchScriptContent = `
const fs = require('fs');
const file = fs.existsSync('vite.config.ts') ? 'vite.config.ts' : (fs.existsSync('vite.config.js') ? 'vite.config.js' : null);
if (!file) {
  fs.writeFileSync('vite.config.js', 'export default { server: { host: "0.0.0.0", port: 3000, strictPort: true, allowedHosts: true, cors: true } }');
  process.exit(0);
}
let c = fs.readFileSync(file, 'utf8');
if (c.includes('allowedHosts: true') || c.includes('allowedHosts: [') || c.includes('allowedHosts: "')) process.exit(0);

// Robust injection for Vite
if (c.includes('server: {')) {
  c = c.replace('server: {', 'server: { allowedHosts: true, cors: true, host: "0.0.0.0", port: 3000, strictPort: true, ');
} else if (c.includes('defineConfig({')) {
  c = c.replace('defineConfig({', 'defineConfig({ server: { allowedHosts: true, cors: true, host: "0.0.0.0", port: 3000, strictPort: true }, ');
} else if (c.includes('export default {')) {
  c = c.replace('export default {', 'export default { server: { allowedHosts: true, cors: true, host: "0.0.0.0", port: 3000, strictPort: true }, ');
} else {
  // If we can't find a good injection point, try to wrap the existing export or add at the end
  console.log('Could not find standard injection point, adding server block at the end');
  c += '\\n// Drape Injection\\nexport const drapeServer = { host: "0.0.0.0", port: 3000, strictPort: true, allowedHosts: true, cors: true };';
}
fs.writeFileSync(file, c);
`;
                    const b64 = Buffer.from(patchScriptContent).toString('base64');

                    return {
                        type: 'react-vite',
                        description: 'React + Vite application',
                        installCommand: 'npm install',
                        // Use base64 to avoid shell escaping hell
                        // Force clear port 3000 and use --strictPort to ensure consistency
                        startCommand: `(fuser -k 3000/tcp || true) && echo "${b64}" | base64 -d | node && npm run dev -- --host 0.0.0.0 --port 3000 --strictPort`,
                        defaultPort: 3000
                    };
                }
                // Create React App
                if (deps['react-scripts']) {
                    return {
                        type: 'react-cra',
                        description: 'Create React App',
                        installCommand: 'npm install',
                        startCommand: 'env PORT=3000 HOST=0.0.0.0 npm start',
                        defaultPort: 3000
                    };
                }
            }

            // Vue
            if (deps.vue) {
                return {
                    type: 'vue',
                    description: 'Vue.js application',
                    installCommand: 'npm install',
                    startCommand: 'npm run dev -- --host 0.0.0.0 --port 3000',
                    defaultPort: 3000
                };
            }

            // Next.js
            if (deps.next) {
                return {
                    type: 'nextjs',
                    description: 'Next.js application',
                    installCommand: 'npm install',
                    startCommand: 'npm run dev -- -p 3000 -H 0.0.0.0',
                    defaultPort: 3000
                };
            }

            // Generic Node with dev script
            if (scripts.dev) {
                return {
                    type: 'node',
                    description: 'Node.js application',
                    installCommand: 'npm install',
                    startCommand: 'env PORT=3000 HOST=0.0.0.0 npm run dev',
                    defaultPort: 3000
                };
            }
        } catch (e) {
            // JSON parse failed, continue to AI
        }
    }

    // Static site (HTML only) - Check this even if package.json exists (could be empty/dummy)
    const isStatic = files.some(f => f.endsWith('index.html'));
    const pkg = configFiles['package.json'] ? JSON.parse(configFiles['package.json']) : null;
    const hasNoDeps = pkg && !pkg.dependencies && !pkg.devDependencies;

    if (isStatic && (!pkg || hasNoDeps)) {
        return {
            type: 'static',
            description: 'Static HTML website',
            installCommand: 'echo "No install needed"',
            startCommand: 'npx -y http-server -p 3000 -c-1',
            defaultPort: 3000
        };
    }

    // Python (Flask/Django)
    if (configFiles['requirements.txt'] || files.some(f => f.endsWith('.py'))) {
        if (files.some(f => f.includes('app.py') || f.includes('main.py'))) {
            return {
                type: 'python',
                description: 'Python web application',
                installCommand: 'pip install -r requirements.txt 2>/dev/null || true',
                startCommand: 'python3 app.py || python3 main.py',
                defaultPort: 3000
            };
        }
    }

    return null; // No fast match, use AI
}

async function analyzeProjectWithAI(files, configFiles = {}) {
    // FAST PATH: Try instant detection first
    const fastResult = fastDetect(files, configFiles);
    if (fastResult) {
        console.log(`⚡ Fast detected: ${fastResult.description}`);
        return fastResult;
    }

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

IMPORTANT RULES FOR PORTS & BINDING:
- You MUST utilize port 3000 for dynamic web applications (React, Vue, Node, etc.). Add 'PORT=3000' to the command if necessary.
- You MUST utilize port 8000 for static sites. Use 'python3 -m http.server 8000' explicitly.
- The Start Command MUST bind to host 0.0.0.0 (e.g. --host 0.0.0.0). This is CRITICAL.
- DO NOT use ports 8080, 5000 or others. Only 3000 and 8000 are exposed.

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
