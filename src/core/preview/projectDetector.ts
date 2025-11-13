/**
 * Project Detection Utility
 * Auto-detects project type, default port, and start command
 */

export interface ProjectInfo {
  type: string;
  defaultPort: number;
  startCommand: string;
  installCommand?: string;
  description: string;
  isReactNative?: boolean; // Flag to indicate React Native/Expo projects
}

/**
 * Detects project type based on package.json and other config files
 * @param files Array of file names in the project root
 * @param packageJson Parsed package.json content (if exists)
 */
export function detectProjectType(files: string[], packageJson?: any): ProjectInfo | null {
  // React Native / Expo (check before React web to avoid false positives)
  if (packageJson?.dependencies?.['expo'] ||
      packageJson?.dependencies?.['react-native'] ||
      packageJson?.devDependencies?.['expo'] ||
      packageJson?.devDependencies?.['react-native'] ||
      files.includes('app.json')) {
    return {
      type: 'react-native',
      defaultPort: 8081, // Expo web default port
      startCommand: 'npx expo start --web --port 8081', // Use web mode for browser preview with custom port
      installCommand: 'npm install',
      description: 'React Native / Expo Application',
      isReactNative: true
    };
  }

  // React (Create React App)
  if (packageJson?.dependencies?.['react'] && packageJson?.scripts?.start) {
    return {
      type: 'react',
      defaultPort: 8080,
      startCommand: 'PORT=8080 npm start',
      installCommand: 'npm install',
      description: 'React Application'
    };
  }

  // Next.js
  if (packageJson?.dependencies?.['next']) {
    return {
      type: 'nextjs',
      defaultPort: 8080,
      startCommand: 'PORT=8080 npm run dev',
      installCommand: 'npm install',
      description: 'Next.js Application'
    };
  }

  // Vue.js
  if (packageJson?.dependencies?.['vue']) {
    return {
      type: 'vue',
      defaultPort: 8080,
      startCommand: 'npm run serve',
      installCommand: 'npm install',
      description: 'Vue.js Application'
    };
  }

  // Vite (React/Vue/Svelte with Vite)
  if (files.includes('vite.config.js') || files.includes('vite.config.ts') || packageJson?.devDependencies?.['vite']) {
    return {
      type: 'vite',
      defaultPort: 5173,
      startCommand: 'npm run dev',
      installCommand: 'npm install',
      description: 'Vite Application'
    };
  }

  // Angular
  if (files.includes('angular.json') || packageJson?.dependencies?.['@angular/core']) {
    return {
      type: 'angular',
      defaultPort: 4200,
      startCommand: 'ng serve',
      installCommand: 'npm install',
      description: 'Angular Application'
    };
  }

  // Svelte/SvelteKit
  if (packageJson?.dependencies?.['svelte']) {
    return {
      type: 'svelte',
      defaultPort: 5000,
      startCommand: 'npm run dev',
      installCommand: 'npm install',
      description: 'Svelte Application'
    };
  }

  // Express.js
  if (packageJson?.dependencies?.['express']) {
    return {
      type: 'express',
      defaultPort: 3000,
      startCommand: 'npm start',
      installCommand: 'npm install',
      description: 'Express.js Server'
    };
  }

  // Gatsby
  if (packageJson?.dependencies?.['gatsby']) {
    return {
      type: 'gatsby',
      defaultPort: 8000,
      startCommand: 'gatsby develop',
      installCommand: 'npm install',
      description: 'Gatsby Application'
    };
  }

  // Nuxt.js
  if (packageJson?.dependencies?.['nuxt']) {
    return {
      type: 'nuxt',
      defaultPort: 3000,
      startCommand: 'npm run dev',
      installCommand: 'npm install',
      description: 'Nuxt.js Application'
    };
  }

  // Python Flask
  if (files.includes('app.py') || files.includes('wsgi.py')) {
    return {
      type: 'flask',
      defaultPort: 5000,
      startCommand: 'python app.py',
      installCommand: 'pip install -r requirements.txt',
      description: 'Flask Application'
    };
  }

  // Python Django
  if (files.includes('manage.py')) {
    return {
      type: 'django',
      defaultPort: 8000,
      startCommand: 'python manage.py runserver',
      installCommand: 'pip install -r requirements.txt',
      description: 'Django Application'
    };
  }

  // Ruby on Rails
  if (files.includes('Gemfile') && files.includes('config.ru')) {
    return {
      type: 'rails',
      defaultPort: 3000,
      startCommand: 'rails server',
      installCommand: 'bundle install',
      description: 'Ruby on Rails Application'
    };
  }

  // Laravel (PHP)
  if (files.includes('artisan')) {
    return {
      type: 'laravel',
      defaultPort: 8000,
      startCommand: 'php artisan serve',
      installCommand: 'composer install',
      description: 'Laravel Application'
    };
  }

  // Go
  if (files.includes('go.mod') || files.includes('main.go')) {
    return {
      type: 'go',
      defaultPort: 8080,
      startCommand: 'go run main.go',
      installCommand: 'go mod download',
      description: 'Go Application'
    };
  }

  // Rust
  if (files.includes('Cargo.toml')) {
    return {
      type: 'rust',
      defaultPort: 8080,
      startCommand: 'cargo run',
      installCommand: 'cargo build',
      description: 'Rust Application'
    };
  }

  // Java Spring Boot
  if (files.includes('pom.xml') || files.includes('build.gradle')) {
    const hasMaven = files.includes('pom.xml');
    return {
      type: 'spring',
      defaultPort: 8080,
      startCommand: hasMaven ? 'mvn spring-boot:run' : 'gradle bootRun',
      installCommand: hasMaven ? 'mvn install' : 'gradle build',
      description: 'Spring Boot Application'
    };
  }

  // C/C++ (CMake)
  if (files.includes('CMakeLists.txt')) {
    return {
      type: 'cmake',
      defaultPort: 8080,
      startCommand: 'cmake --build build && ./build/main',
      installCommand: 'cmake -B build',
      description: 'C/C++ (CMake) Application'
    };
  }

  // C/C++ (Makefile)
  if (files.includes('Makefile') && (files.some(f => f.endsWith('.c')) || files.some(f => f.endsWith('.cpp')))) {
    return {
      type: 'make',
      defaultPort: 8080,
      startCommand: 'make && ./main',
      installCommand: 'make',
      description: 'C/C++ (Makefile) Application'
    };
  }

  // C# (.NET)
  if (files.some(f => f.endsWith('.csproj')) || files.some(f => f.endsWith('.sln'))) {
    return {
      type: 'dotnet',
      defaultPort: 5000,
      startCommand: 'dotnet run',
      installCommand: 'dotnet restore',
      description: 'C# (.NET) Application'
    };
  }

  // Swift (Server-side Swift / Vapor)
  if (files.includes('Package.swift')) {
    return {
      type: 'swift',
      defaultPort: 8080,
      startCommand: 'swift run',
      installCommand: 'swift build',
      description: 'Swift Application'
    };
  }

  // Kotlin (Gradle)
  if (files.includes('build.gradle.kts') && !files.includes('pom.xml')) {
    return {
      type: 'kotlin',
      defaultPort: 8080,
      startCommand: './gradlew run',
      installCommand: './gradlew build',
      description: 'Kotlin Application'
    };
  }

  // Elixir/Phoenix
  if (files.includes('mix.exs')) {
    return {
      type: 'phoenix',
      defaultPort: 4000,
      startCommand: 'mix phx.server',
      installCommand: 'mix deps.get',
      description: 'Elixir/Phoenix Application'
    };
  }

  // Ruby/Sinatra
  if (files.includes('Gemfile') && files.includes('app.rb') && !files.includes('config.ru')) {
    return {
      type: 'sinatra',
      defaultPort: 4567,
      startCommand: 'ruby app.rb',
      installCommand: 'bundle install',
      description: 'Ruby/Sinatra Application'
    };
  }

  // Deno
  if (files.includes('deno.json') || files.includes('deno.jsonc')) {
    return {
      type: 'deno',
      defaultPort: 8000,
      startCommand: 'deno task start',
      installCommand: 'deno cache deps.ts',
      description: 'Deno Application'
    };
  }

  // Bun
  if (files.includes('bun.lockb') || (packageJson && packageJson.scripts?.['bun'])) {
    return {
      type: 'bun',
      defaultPort: 3000,
      startCommand: 'bun run dev',
      installCommand: 'bun install',
      description: 'Bun Application'
    };
  }

  // Remix
  if (packageJson?.dependencies?.['@remix-run/react']) {
    return {
      type: 'remix',
      defaultPort: 3000,
      startCommand: 'npm run dev',
      installCommand: 'npm install',
      description: 'Remix Application'
    };
  }

  // Astro
  if (packageJson?.dependencies?.['astro']) {
    return {
      type: 'astro',
      defaultPort: 3000,
      startCommand: 'npm run dev',
      installCommand: 'npm install',
      description: 'Astro Application'
    };
  }

  // SolidJS
  if (packageJson?.dependencies?.['solid-js']) {
    return {
      type: 'solid',
      defaultPort: 3000,
      startCommand: 'npm run dev',
      installCommand: 'npm install',
      description: 'SolidJS Application'
    };
  }

  // Qwik
  if (packageJson?.dependencies?.['@builder.io/qwik']) {
    return {
      type: 'qwik',
      defaultPort: 5173,
      startCommand: 'npm run dev',
      installCommand: 'npm install',
      description: 'Qwik Application'
    };
  }

  // FastAPI (Python)
  if (files.includes('main.py') && files.includes('requirements.txt')) {
    // Check if it's FastAPI by looking for common patterns
    return {
      type: 'fastapi',
      defaultPort: 8000,
      startCommand: 'uvicorn main:app --reload',
      installCommand: 'pip install -r requirements.txt',
      description: 'FastAPI Application'
    };
  }

  // Static HTML
  if (files.includes('index.html') && !packageJson) {
    return {
      type: 'static',
      defaultPort: 8000,
      startCommand: 'python -m http.server 8000',
      description: 'Static HTML Site'
    };
  }

  // Generic Node.js project
  if (packageJson && packageJson.scripts?.start) {
    return {
      type: 'node',
      defaultPort: 3000,
      startCommand: 'npm start',
      installCommand: 'npm install',
      description: 'Node.js Application'
    };
  }

  return null;
}

/**
 * Builds preview URL from IP address and port
 * Uses the backend server's IP since the dev server runs on the backend
 */
export function buildPreviewUrl(backendUrl: string, port: number): string {
  // Extract the IP from the backend URL (e.g., "http://192.168.0.133:3000" -> "192.168.0.133")
  const match = backendUrl.match(/https?:\/\/([^:]+)/);
  const ip = match ? match[1] : 'localhost';
  return `http://${ip}:${port}`;
}
