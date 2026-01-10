#!/usr/bin/env node

/**
 * RALPH CLI - Run Agent Loop from Terminal
 *
 * Usage:
 *   node ralph.js --prompt "Crea sito vape shop" --project test-1
 *   node ralph.js --prompt "Crea e-commerce" --project test-2 --mode planning
 *   node ralph.js --help
 */

const axios = require('axios');

// Config
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Parse arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        prompt: null,
        project: `cli-${Date.now()}`,
        mode: 'fast',
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--prompt':
            case '-p':
                options.prompt = args[++i];
                break;
            case '--project':
            case '--id':
                options.project = args[++i];
                break;
            case '--mode':
            case '-m':
                options.mode = args[++i];
                break;
            case '--help':
            case '-h':
                options.help = true;
                break;
        }
    }

    return options;
}

function showHelp() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                        RALPH LOOP                                 ║
║                                                                   ║
║  "Iteration > Perfection"                                         ║
╚══════════════════════════════════════════════════════════════════╝

USO:
  node ralph.js -p "La tua richiesta" --id nome-progetto

OPZIONI:
  -p, --prompt    Cosa vuoi fare (obbligatorio)
  --id, --project ID progetto (obbligatorio)
  -h, --help      Mostra questo aiuto

ESEMPI:
  # Crea nuovo progetto
  node ralph.js -p "Crea sito per vape shop con carrello" --id vape-1

  # Modifica progetto esistente
  node ralph.js -p "Aggiungi pagina contatti" --id vape-1

  # Chiedi info sul progetto
  node ralph.js -p "Di cosa è questo sito?" --id vape-1

COME FUNZIONA:
  1. Ralph legge .drape/project.json per capire il contesto
  2. Esegue la richiesta mantenendo lo stile appropriato
  3. Usa contenuto realistico (mai "Product 1" o "Lorem ipsum")
  4. Chiama signal_completion quando ha finito

INDUSTRY SUPPORTATE:
  vape-shop, restaurant, e-commerce, portfolio, blog
`);
}

// Event icons
const icons = {
    start: '🚀',
    thinking: '🤔',
    iteration_start: '🔄',
    tool_start: '🔧',
    tool_complete: '✅',
    tool_error: '❌',
    complete: '🎉',
    plan_created: '📋',
    plan_ready: '📋',
    message: '💬',
    error: '💥',
    fatal_error: '💀',
    done: '✨'
};

const toolIcons = {
    write_file: '📝',
    read_file: '📖',
    list_directory: '📁',
    run_command: '⚡',
    edit_file: '✏️',
    signal_completion: '🏁',
    create_plan: '📋'
};

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
};

// Format event for display
function formatEvent(event) {
    const icon = icons[event.type] || '•';
    const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    const c = colors;

    switch (event.type) {
        case 'start':
            return `\n${icon} ${c.bright}[${time}]${c.reset} ${c.green}Starting agent loop...${c.reset}\n   Mode: ${event.mode || 'fast'}\n   Project: ${event.projectId}\n   Context: ${event.hasContext ? 'loaded' : 'none'}`;

        case 'iteration_start':
            return `\n${icon} ${c.dim}[${time}]${c.reset} ${c.cyan}Iteration ${event.iteration}/${event.maxIterations}${c.reset}`;

        case 'thinking':
            return `${icon} ${c.dim}[${time}]${c.reset} ${c.yellow}AI is thinking...${c.reset}`;

        case 'tool_start': {
            const toolIcon = toolIcons[event.tool] || '🔧';
            let inputStr = '';
            if (event.input) {
                // Truncate long inputs for display
                const inputJson = JSON.stringify(event.input);
                inputStr = inputJson.length > 100 ? inputJson.substring(0, 100) + '...' : inputJson;
            }
            return `${toolIcon} ${c.dim}[${time}]${c.reset} ${c.blue}${event.tool}${c.reset} ${c.dim}${inputStr}${c.reset}`;
        }

        case 'tool_complete': {
            const resultIcon = event.success ? '✅' : '❌';
            const resultColor = event.success ? c.green : c.red;
            let details = '';
            if (event.result?.message) {
                details = ` - ${event.result.message}`;
            } else if (event.result?.exitCode !== undefined) {
                details = ` - exit code: ${event.result.exitCode}`;
            }
            return `  ${resultIcon} ${resultColor}${event.tool} completed${c.reset}${details}`;
        }

        case 'tool_error':
            return `  ${c.red}❌ ${event.tool} failed: ${event.error}${c.reset}`;

        case 'message':
            return `${icon} ${c.dim}[${time}]${c.reset} AI: ${event.content?.substring(0, 200)}...`;

        case 'complete':
            return `\n${c.bright}${icon} COMPLETED!${c.reset}\n   ${c.green}Summary:${c.reset} ${event.summary}\n   ${c.green}Files Created:${c.reset} ${event.filesCreated?.join(', ') || 'none'}\n   ${c.green}Files Modified:${c.reset} ${event.filesModified?.join(', ') || 'none'}\n   ${c.green}Iterations:${c.reset} ${event.iterations || '?'}`;

        case 'plan_created':
        case 'plan_ready':
            return `\n${icon} ${c.bright}${c.magenta}PLAN CREATED${c.reset}\n${'─'.repeat(60)}\n${event.planContent || JSON.stringify(event.plan, null, 2)}\n${'─'.repeat(60)}\n\n${c.yellow}⏸️  Review the plan. Run with --mode execute to proceed.${c.reset}`;

        case 'error':
            return `${icon} ${c.dim}[${time}]${c.reset} ${c.yellow}Error: ${event.error}${c.reset}`;

        case 'fatal_error':
            return `\n${icon} ${c.red}${c.bright}FATAL ERROR:${c.reset} ${c.red}${event.error}${c.reset}`;

        case 'done':
            return `\n${icon} ${c.dim}Agent loop finished.${c.reset}`;

        default:
            return `${icon} ${c.dim}[${time}]${c.reset} ${event.type}: ${JSON.stringify(event).substring(0, 100)}`;
    }
}

// Run the agent
async function runAgent(options) {
    const { prompt, project } = options;

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                        RALPH LOOP                                 ║
╚══════════════════════════════════════════════════════════════════╝

  Progetto: ${project}
  Richiesta: "${prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt}"

${'═'.repeat(68)}
`);

    const endpoint = `${BACKEND_URL}/agent/run/fast`;
    const requestBody = { prompt, projectId: project };

    try {
        const response = await axios({
            method: 'POST',
            url: endpoint,
            data: requestBody,
            responseType: 'stream',
            headers: { 'Content-Type': 'application/json' }
        });

        // Process SSE stream
        let buffer = '';

        response.data.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event = JSON.parse(line.slice(6));
                        console.log(formatEvent(event));

                        // If plan ready in planning mode, ask for approval
                        if (event.type === 'plan_ready') {
                            console.log('\n⏸️  Plan ready. Run with --mode execute to proceed.');
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
        });

        response.data.on('end', () => {
            console.log('\n' + '═'.repeat(68));
            console.log('Agent loop completed.');
        });

        response.data.on('error', (err) => {
            console.error('Stream error:', err.message);
        });

    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.error(`
❌ Cannot connect to backend at ${BACKEND_URL}

Make sure the backend is running:
  cd backend && npm run dev
`);
        } else {
            console.error('Error:', error.message);
        }
        process.exit(1);
    }
}

// Main
async function main() {
    const options = parseArgs();

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (!options.prompt) {
        console.error('❌ Errore: -p/--prompt è obbligatorio\n');
        showHelp();
        process.exit(1);
    }

    if (options.project.startsWith('cli-')) {
        console.error('❌ Errore: --id è obbligatorio\n');
        console.error('   Specifica un ID progetto, es: --id mio-progetto\n');
        showHelp();
        process.exit(1);
    }

    await runAgent(options);
}

main();
