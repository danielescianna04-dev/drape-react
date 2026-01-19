/**
 * AI Project Analyzer Service
 * Comprehensive framework detection for 45+ frameworks
 */

const { getProviderForModel } = require('./ai-providers');
const { DEFAULT_AI_MODEL } = require('../utils/constants');

/**
 * Detect package manager from lock files
 */
function detectPackageManager(files) {
    if (files.some(f => f.includes('pnpm-lock.yaml'))) return 'pnpm';
    if (files.some(f => f.includes('yarn.lock'))) return 'yarn';
    if (files.some(f => f.includes('bun.lockb'))) return 'bun';
    if (files.some(f => f.includes('package-lock.json'))) return 'npm';
    if (files.some(f => f.includes('Gemfile.lock'))) return 'bundle';
    if (files.some(f => f.includes('go.sum'))) return 'go';
    if (files.some(f => f.includes('Cargo.lock'))) return 'cargo';
    if (files.some(f => f.includes('composer.lock'))) return 'composer';
    return 'npm'; // Default for JS
}

/**
 * Get install command with fallback (ensures PM is available)
 */
function getInstallCommand(pm, files = []) {
    if (pm === 'pnpm') {
        return '(command -v pnpm > /dev/null || npm i -g pnpm) && pnpm install';
    }
    if (pm === 'yarn') return 'yarn';
    if (pm === 'bun') return 'bun install';
    if (pm === 'bundle') return 'bundle install';
    if (pm === 'cargo') return 'cargo build';
    if (pm === 'go') return 'go mod download';
    if (pm === 'composer') return 'composer install';
    if (pm === 'pip') return 'pip install -r requirements.txt';
    if (pm === 'maven') return './mvnw install -DskipTests';
    if (pm === 'gradle') return './gradlew build -x test';
    if (pm === 'dotnet') return 'dotnet restore';
    return 'npm install';
}

/**
 * Get run command prefix based on package manager
 */
function getRunCommand(pm) {
    if (pm === 'pnpm') return 'pnpm';
    if (pm === 'yarn') return 'yarn';
    if (pm === 'bun') return 'bun run';
    return 'npm run';
}

/**
 * Determine if a project type has a Web UI (vs CLI-only output)
 * CLI-only types will show terminal output in PreviewPanel instead of WebView
 */
function hasWebUI(type) {
    // Types that are CLI-only (no web server output)
    const cliOnlyTypes = [
        'go',       // Generic Go without web framework
        'rust',     // Generic Rust without web framework
        'ruby',     // Generic Ruby without web framework
        'deno',     // Generic Deno without Fresh
        'node',     // Generic Node.js (might be CLI tool)
    ];
    return !cliOnlyTypes.includes(type);
}

/**
 * COMPREHENSIVE FAST PATH: Instant detection for ALL frameworks
 * Skips AI entirely for well-known patterns
 */
function fastDetect(files, configFiles) {
    const pm = detectPackageManager(files);
    const install = getInstallCommand(pm, files);
    const run = getRunCommand(pm);
    // NOTE: Port killing is handled by startup script in workspace-orchestrator.js
    // Do NOT add killPort prefix here - it causes invalid nohup syntax

    // ====== JAVASCRIPT/TYPESCRIPT FRONTEND ======
    const packageJson = configFiles['package.json'];
    if (packageJson) {
        try {
            const pkg = JSON.parse(packageJson);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const scripts = pkg.scripts || {};

            // Next.js
            if (deps.next) {
                return {
                    type: 'nextjs',
                    description: 'Next.js application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `npx next dev --turbo -H 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Nuxt
            if (deps.nuxt) {
                return {
                    type: 'nuxt',
                    description: 'Nuxt.js application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // SvelteKit
            if (deps['@sveltejs/kit']) {
                return {
                    type: 'sveltekit',
                    description: 'SvelteKit application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Remix
            if (deps['@remix-run/react']) {
                return {
                    type: 'remix',
                    description: 'Remix application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Astro
            if (deps.astro) {
                return {
                    type: 'astro',
                    description: 'Astro application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Gatsby
            if (deps.gatsby) {
                return {
                    type: 'gatsby',
                    description: 'Gatsby application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} develop -- -H 0.0.0.0 -p 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Solid.js
            if (deps['solid-js']) {
                return {
                    type: 'solid',
                    description: 'Solid.js application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Qwik
            if (deps['@builder.io/qwik']) {
                return {
                    type: 'qwik',
                    description: 'Qwik application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Preact
            if (deps.preact && !deps.react) {
                return {
                    type: 'preact',
                    description: 'Preact application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Eleventy
            if (deps['@11ty/eleventy']) {
                return {
                    type: 'eleventy',
                    description: 'Eleventy (11ty) static site',
                    language: 'javascript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} serve -- --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Angular
            if (deps['@angular/core']) {
                return {
                    type: 'angular',
                    description: 'Angular application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} start -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Svelte (without Kit)
            if (deps.svelte && !deps['@sveltejs/kit']) {
                return {
                    type: 'svelte',
                    description: 'Svelte application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Vue (without Nuxt)
            if (deps.vue && !deps.nuxt) {
                return {
                    type: 'vue',
                    description: 'Vue.js application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `${run} dev -- --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // React (Vite or CRA)
            if (deps.react) {
                if (deps.vite || scripts.dev?.includes('vite')) {
                    // Vite configuration patch
                    const patchScriptContent = `
const fs = require('fs');
const file = fs.existsSync('vite.config.ts') ? 'vite.config.ts' : (fs.existsSync('vite.config.js') ? 'vite.config.js' : null);
if (!file) {
  fs.writeFileSync('vite.config.js', 'export default { server: { host: "0.0.0.0", port: 3000, strictPort: true, allowedHosts: true, cors: true } }');
  process.exit(0);
}
let c = fs.readFileSync(file, 'utf8');
if (c.includes('allowedHosts: true') || c.includes('allowedHosts: [') || c.includes('allowedHosts: "')) process.exit(0);

if (c.includes('server: {')) {
  c = c.replace('server: {', 'server: { allowedHosts: true, cors: true, host: "0.0.0.0", port: 3000, strictPort: true, ');
} else if (c.includes('defineConfig({')) {
  c = c.replace('defineConfig({', 'defineConfig({ server: { allowedHosts: true, cors: true, host: "0.0.0.0", port: 3000, strictPort: true }, ');
} else if (c.includes('export default {')) {
  c = c.replace('export default {', 'export default { server: { allowedHosts: true, cors: true, host: "0.0.0.0", port: 3000, strictPort: true }, ');
}
fs.writeFileSync(file, c);
`;
                    const b64 = Buffer.from(patchScriptContent).toString('base64');

                    return {
                        type: 'react-vite',
                        description: 'React + Vite application',
                        language: 'typescript',
                        packageManager: pm,
                        installCommand: install,
                        startCommand: `echo "${b64}" | base64 -d | node && npx vite --host 0.0.0.0 --port 3000 --strictPort`,
                        defaultPort: 3000,
                        requiresDocker: false
                    };
                }
                // Create React App
                if (deps['react-scripts']) {
                    return {
                        type: 'react-cra',
                        description: 'Create React App',
                        language: 'typescript',
                        packageManager: pm,
                        installCommand: install,
                        startCommand: `env PORT=3000 HOST=0.0.0.0 ${run} start`,
                        defaultPort: 3000,
                        requiresDocker: false
                    };
                }
            }

            // Vite vanilla (no framework)
            if (deps.vite && !deps.react && !deps.vue && !deps.svelte && !deps['solid-js']) {
                return {
                    type: 'vite-vanilla',
                    description: 'Vite vanilla JavaScript',
                    language: 'javascript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `npx vite --host 0.0.0.0 --port 3000`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Node.js Backend Frameworks
            if (deps['@nestjs/core']) {
                return {
                    type: 'nestjs',
                    description: 'NestJS application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `env PORT=3000 ${run} start:dev`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            if (deps.hono && pm === 'bun') {
                return {
                    type: 'bun-hono',
                    description: 'Bun + Hono application',
                    language: 'typescript',
                    packageManager: 'bun',
                    installCommand: 'bun install',
                    startCommand: `env PORT=3000 bun run dev`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            if (deps.elysia && pm === 'bun') {
                return {
                    type: 'bun-elysia',
                    description: 'Bun + Elysia application',
                    language: 'typescript',
                    packageManager: 'bun',
                    installCommand: 'bun install',
                    startCommand: `env PORT=3000 bun run dev`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            if (deps.hono) {
                return {
                    type: 'hono',
                    description: 'Hono application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `env PORT=3000 ${run} dev`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            if (deps.fastify) {
                return {
                    type: 'fastify',
                    description: 'Fastify application',
                    language: 'typescript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `env PORT=3000 ${run} start`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            if (deps.express) {
                return {
                    type: 'express',
                    description: 'Express.js application',
                    language: 'javascript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `env PORT=3000 node server.js || ${run} start`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }

            // Generic Node with dev script
            if (scripts.dev) {
                return {
                    type: 'node',
                    description: 'Node.js application',
                    language: 'javascript',
                    packageManager: pm,
                    installCommand: install,
                    startCommand: `env PORT=3000 HOST=0.0.0.0 ${run} dev`,
                    defaultPort: 3000,
                    requiresDocker: false
                };
            }
        } catch (e) {
            // JSON parse failed, continue
        }
    }

    // ====== BUN ======
    if (files.some(f => f.includes('bun.lockb'))) {
        return {
            type: 'bun',
            description: 'Bun application',
            language: 'typescript',
            packageManager: 'bun',
            installCommand: 'bun install',
            startCommand: `bun run dev --port 3000`,
            defaultPort: 3000,
            requiresDocker: false
        };
    }

    // ====== DENO ======
    const denoJson = configFiles['deno.json'] || configFiles['deno.jsonc'];
    if (denoJson || files.some(f => f.endsWith('.ts') && !files.some(f => f.includes('package.json')))) {
        // Fresh
        if (files.some(f => f.includes('fresh.gen.ts'))) {
            return {
                type: 'deno-fresh',
                description: 'Deno Fresh application',
                language: 'typescript',
                packageManager: 'deno',
                installCommand: 'deno cache main.ts',
                startCommand: `deno task start --port 3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }
        // Generic Deno
        if (denoJson) {
            return {
                type: 'deno',
                description: 'Deno application',
                language: 'typescript',
                packageManager: 'deno',
                installCommand: 'deno cache main.ts',
                startCommand: `deno run --allow-all main.ts`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }
    }

    // ====== PYTHON ======
    const requirementsTxt = configFiles['requirements.txt'];
    if (requirementsTxt || files.some(f => f.endsWith('.py'))) {
        const reqContent = requirementsTxt || '';

        // Streamlit
        if (reqContent.includes('streamlit') || files.some(f => f.includes('streamlit'))) {
            return {
                type: 'streamlit',
                description: 'Streamlit application',
                language: 'python',
                packageManager: 'pip',
                installCommand: 'pip install -r requirements.txt',
                startCommand: `streamlit run app.py --server.port 3000 --server.address 0.0.0.0`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // FastAPI
        if (reqContent.includes('fastapi') || files.some(f => f.includes('fastapi'))) {
            return {
                type: 'fastapi',
                description: 'FastAPI application',
                language: 'python',
                packageManager: 'pip',
                installCommand: 'pip install -r requirements.txt',
                startCommand: `uvicorn main:app --host 0.0.0.0 --port 3000 --reload`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Django
        if (reqContent.includes('django') || files.some(f => f.includes('manage.py'))) {
            return {
                type: 'django',
                description: 'Django application',
                language: 'python',
                packageManager: 'pip',
                installCommand: 'pip install -r requirements.txt',
                startCommand: `python manage.py runserver 0.0.0.0:3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Flask
        if (reqContent.includes('flask') || files.some(f => f.includes('app.py') || f.includes('main.py'))) {
            return {
                type: 'flask',
                description: 'Flask application',
                language: 'python',
                packageManager: 'pip',
                installCommand: 'pip install -r requirements.txt',
                startCommand: `flask run --host 0.0.0.0 --port 3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }
    }

    // ====== GO ======
    const goMod = configFiles['go.mod'];
    if (goMod || files.some(f => f.endsWith('.go'))) {
        const modContent = goMod || '';

        // Gin
        if (modContent.includes('gin-gonic/gin')) {
            return {
                type: 'go-gin',
                description: 'Go + Gin application',
                language: 'go',
                packageManager: 'go',
                installCommand: 'go mod download',
                startCommand: `env PORT=3000 go run main.go`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Fiber
        if (modContent.includes('gofiber/fiber')) {
            return {
                type: 'go-fiber',
                description: 'Go + Fiber application',
                language: 'go',
                packageManager: 'go',
                installCommand: 'go mod download',
                startCommand: `env PORT=3000 go run main.go`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Echo
        if (modContent.includes('labstack/echo')) {
            return {
                type: 'go-echo',
                description: 'Go + Echo application',
                language: 'go',
                packageManager: 'go',
                installCommand: 'go mod download',
                startCommand: `env PORT=3000 go run main.go`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Chi
        if (modContent.includes('go-chi/chi')) {
            return {
                type: 'go-chi',
                description: 'Go + Chi application',
                language: 'go',
                packageManager: 'go',
                installCommand: 'go mod download',
                startCommand: `env PORT=3000 go run main.go`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Generic Go
        return {
            type: 'go',
            description: 'Go application',
            language: 'go',
            packageManager: 'go',
            installCommand: 'go mod download',
            startCommand: `env PORT=3000 go run .`,
            defaultPort: 3000,
            requiresDocker: false
        };
    }

    // ====== RUST ======
    const cargoToml = configFiles['Cargo.toml'];
    if (cargoToml || files.some(f => f.endsWith('.rs'))) {
        const cargoContent = cargoToml || '';

        // Actix
        if (cargoContent.includes('actix-web')) {
            return {
                type: 'rust-actix',
                description: 'Rust + Actix Web application',
                language: 'rust',
                packageManager: 'cargo',
                installCommand: 'cargo build',
                startCommand: `env PORT=3000 cargo run`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Axum
        if (cargoContent.includes('axum')) {
            return {
                type: 'rust-axum',
                description: 'Rust + Axum application',
                language: 'rust',
                packageManager: 'cargo',
                installCommand: 'cargo build',
                startCommand: `env PORT=3000 cargo run`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Rocket
        if (cargoContent.includes('rocket')) {
            return {
                type: 'rust-rocket',
                description: 'Rust + Rocket application',
                language: 'rust',
                packageManager: 'cargo',
                installCommand: 'cargo build',
                startCommand: `env ROCKET_PORT=3000 ROCKET_ADDRESS=0.0.0.0 cargo run`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Warp
        if (cargoContent.includes('warp')) {
            return {
                type: 'rust-warp',
                description: 'Rust + Warp application',
                language: 'rust',
                packageManager: 'cargo',
                installCommand: 'cargo build',
                startCommand: `env PORT=3000 cargo run`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Generic Rust
        return {
            type: 'rust',
            description: 'Rust application',
            language: 'rust',
            packageManager: 'cargo',
            installCommand: 'cargo build',
            startCommand: `env PORT=3000 cargo run`,
            defaultPort: 3000,
            requiresDocker: false
        };
    }

    // ====== RUBY ======
    const gemfile = configFiles['Gemfile'];
    if (gemfile || files.some(f => f.endsWith('.rb'))) {
        const gemContent = gemfile || '';

        // Rails
        if (gemContent.includes('rails')) {
            return {
                type: 'rails',
                description: 'Ruby on Rails application',
                language: 'ruby',
                packageManager: 'bundle',
                installCommand: 'bundle install',
                startCommand: `rails server -b 0.0.0.0 -p 3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Sinatra
        if (gemContent.includes('sinatra')) {
            return {
                type: 'sinatra',
                description: 'Sinatra application',
                language: 'ruby',
                packageManager: 'bundle',
                installCommand: 'bundle install',
                startCommand: `ruby app.rb -o 0.0.0.0 -p 3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Generic Ruby
        return {
            type: 'ruby',
            description: 'Ruby application',
            language: 'ruby',
            packageManager: 'bundle',
            installCommand: 'bundle install',
            startCommand: `ruby main.rb`,
            defaultPort: 3000,
            requiresDocker: false
        };
    }

    // ====== PHP ======
    const composerJson = configFiles['composer.json'];
    if (composerJson || files.some(f => f.endsWith('.php'))) {
        const composerContent = composerJson || '';

        // Laravel
        if (composerContent.includes('laravel')) {
            return {
                type: 'laravel',
                description: 'Laravel application',
                language: 'php',
                packageManager: 'composer',
                installCommand: 'composer install',
                startCommand: `php artisan serve --host=0.0.0.0 --port=3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Symfony
        if (composerContent.includes('symfony')) {
            return {
                type: 'symfony',
                description: 'Symfony application',
                language: 'php',
                packageManager: 'composer',
                installCommand: 'composer install',
                startCommand: `symfony server:start --port=3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Generic PHP
        return {
            type: 'php',
            description: 'PHP application',
            language: 'php',
            packageManager: 'composer',
            installCommand: 'echo "Ready"',
            startCommand: `php -S 0.0.0.0:3000`,
            defaultPort: 3000,
            requiresDocker: false
        };
    }

    // ====== JAVA ======
    const pomXml = configFiles['pom.xml'];
    const buildGradle = configFiles['build.gradle'] || configFiles['build.gradle.kts'];

    if (pomXml) {
        const pomContent = pomXml;

        // Quarkus
        if (pomContent.includes('quarkus')) {
            return {
                type: 'quarkus',
                description: 'Quarkus application',
                language: 'java',
                packageManager: 'maven',
                installCommand: './mvnw install -DskipTests',
                startCommand: `./mvnw quarkus:dev -Dquarkus.http.port=3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Spring Boot
        if (pomContent.includes('spring-boot')) {
            return {
                type: 'spring-boot',
                description: 'Spring Boot application',
                language: 'java',
                packageManager: 'maven',
                installCommand: './mvnw install -DskipTests',
                startCommand: `env PORT=3000 ./mvnw spring-boot:run`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }
    }

    if (buildGradle) {
        const gradleContent = buildGradle;

        // Spring Boot (Gradle)
        if (gradleContent.includes('spring')) {
            return {
                type: 'spring-gradle',
                description: 'Spring Boot (Gradle) application',
                language: 'java',
                packageManager: 'gradle',
                installCommand: './gradlew build -x test',
                startCommand: `env PORT=3000 ./gradlew bootRun`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }
    }

    // ====== .NET / C# ======
    if (files.some(f => f.endsWith('.csproj'))) {
        const csprojFile = files.find(f => f.endsWith('.csproj'));
        const csprojContent = configFiles[csprojFile] || '';

        // Blazor
        if (csprojContent.includes('Blazor') || csprojContent.includes('blazor')) {
            return {
                type: 'dotnet-blazor',
                description: 'Blazor application',
                language: 'csharp',
                packageManager: 'dotnet',
                installCommand: 'dotnet restore',
                startCommand: `dotnet run --urls http://0.0.0.0:3000`,
                defaultPort: 3000,
                requiresDocker: false
            };
        }

        // Generic .NET
        return {
            type: 'dotnet',
            description: '.NET application',
            language: 'csharp',
            packageManager: 'dotnet',
            installCommand: 'dotnet restore',
            startCommand: `dotnet run --urls http://0.0.0.0:3000`,
            defaultPort: 3000,
            requiresDocker: false
        };
    }

    // ====== STATIC SITE ======
    const isStatic = files.some(f => f.endsWith('index.html'));
    const pkg = packageJson ? JSON.parse(packageJson) : null;
    const hasNoDeps = pkg && !pkg.dependencies && !pkg.devDependencies;

    if (isStatic && (!pkg || hasNoDeps)) {
        return {
            type: 'static',
            description: 'Static HTML website',
            language: 'html',
            packageManager: 'npm',
            installCommand: 'echo "No install needed"',
            startCommand: 'npx -y http-server -p 3000 -c-1',
            defaultPort: 3000,
            requiresDocker: false
        };
    }

    return null; // No fast match, use AI
}

async function analyzeProjectWithAI(files, configFiles = {}) {
    // FAST PATH: Try instant detection first
    const fastResult = fastDetect(files, configFiles);
    if (fastResult) {
        console.log(`⚡ Fast detected: ${fastResult.description}`);
        // Add hasWebUI field based on project type
        fastResult.hasWebUI = hasWebUI(fastResult.type);
        return fastResult;
    }

    console.log('🧠 AI analyzing project structure...');

    // Read the prompt template
    const fs = require('fs');
    const path = require('path');
    const promptPath = path.join(__dirname, '../prompts/project-analysis.txt');
    let promptTemplate = '';

    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf8');
    } catch (e) {
        console.error('Failed to read prompt template:', e);
        // Fallback to basic prompt
        promptTemplate = `You are an expert DevOps engineer analyzing a project to determine how to run it in a cloud container.

## PROJECT FILES
\${files.join('\\n')}

## CONFIGURATION FILES
\${Object.entries(configFiles).map(([name, content]) => \`--- \${name} ---\\n\${content}\\n\`).join('\\n')}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "type": "framework-id",
  "description": "Human readable description",
  "language": "javascript|typescript|python|go|rust|ruby|php|java|csharp",
  "packageManager": "npm|yarn|pnpm|bun|pip|cargo|go|bundle|composer|maven|gradle|dotnet",
  "installCommand": "full install command",
  "startCommand": "full start command with port and host",
  "defaultPort": 3000,
  "requiresDocker": false
}`;
    }

    // Interpolate the template
    const prompt = eval('`' + promptTemplate.replace(/`/g, '\\`') + '`');

    try {
        const { provider, modelId } = getProviderForModel(DEFAULT_AI_MODEL);

        if (!provider.client) {
            await provider.initialize();
        }

        let responseText = '';
        for await (const chunk of provider.chatStream([{ role: 'user', content: prompt }], { model: modelId })) {
            if (chunk.type === 'text') {
                responseText += chunk.text;
            }
        }

        // Clean markdown if present
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const json = JSON.parse(jsonMatch[0]);
            // Validate port is number
            if (json.defaultPort) json.defaultPort = parseInt(json.defaultPort);
            // Add hasWebUI field based on project type
            json.hasWebUI = hasWebUI(json.type);
            return json;
        } else {
            throw new Error('No JSON found in AI response');
        }

    } catch (error) {
        console.error('❌ AI Analysis failed:', error);
        return null;
    }
}

/**
 * Analyze project to determine required Environment Variables
 */
async function analyzeEnvVars(files, configFiles = {}) {
    console.log('🧪 AI Analyzing Environment Variables...');

    const prompt = `
You are a senior DevOps engineer. Analyze this project structure and code to identify necessary Environment Variables (.env).

files:
${files.join('\n')}

Configuration Files:
${Object.entries(configFiles).map(([name, content]) => `--- ${name} ---\n${content}\n`).join('\n')}

Identify all API keys, database URLs, auth tokens, and configuration flags that should be in a .env file.
For each variable, provide:
1. Key (e.g. DATABASE_URL, STRIPE_SECRET_KEY)
2. Description (Why is it needed?)
3. Is Secret (true/false)
4. Default/Example Value (e.g. postgres://localhost:5432/db)

Return ONLY a JSON array in this format (no markdown):
[
  {
    "key": "DATABASE_URL",
    "description": "Connection string for PostgreSQL",
    "isSecret": true,
    "defaultValue": "postgres://user:pass@localhost:5432/dbname"
  },
  ...
]
`;

    try {
        const { provider, modelId } = getProviderForModel(DEFAULT_AI_MODEL);

        if (!provider.client) {
            await provider.initialize();
        }

        let responseText = '';
        for await (const chunk of provider.chatStream([{ role: 'user', content: prompt }], { model: modelId })) {
            if (chunk.type === 'text') {
                responseText += chunk.text;
            }
        }

        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return [];

    } catch (error) {
        console.error('❌ AI Env Analysis failed:', error);
        return [];
    }
}

module.exports = { analyzeProjectWithAI, analyzeEnvVars };
