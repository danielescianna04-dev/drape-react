/**
 * Project Detection Utility
 * Auto-detects project type, default port, and start command
 */

function detectProjectType(files, packageJson) {
  // React Native / Expo (check before React web to avoid false positives)
  if (packageJson?.dependencies?.['expo'] ||
      packageJson?.dependencies?.['react-native'] ||
      packageJson?.devDependencies?.['expo'] ||
      packageJson?.devDependencies?.['react-native'] ||
      files.includes('app.json')) {

    // Check if project has web support (webpack config or react-native-web)
    const hasWebSupport = packageJson?.dependencies?.['react-native-web'] ||
                          packageJson?.devDependencies?.['@expo/webpack-config'] ||
                          files.includes('webpack.config.js');

    return {
      type: 'react-native',
      defaultPort: 8085,  // Use 8085 to avoid conflict with main app on 8081
      startCommand: hasWebSupport ? 'npx expo start --web --port 8085' : 'npx expo start --port 8085',
      installCommand: 'npm install',
      description: 'React Native / Expo Application',
      isReactNative: true,
      supportsWebPreview: hasWebSupport,
      previewNote: hasWebSupport
        ? 'Web preview available via Expo Web'
        : 'This is a mobile-only React Native project. Preview requires Expo Go app on your device. Scan the QR code in the terminal.'
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

  // C# / .NET (check for .csproj, .sln, or .cs files)
  const csprojFile = files.find(f => f.endsWith('.csproj'));
  const slnFile = files.find(f => f.endsWith('.sln'));
  const hasCSharpProject = csprojFile || slnFile;
  const hasCSharpFiles = files.some(f => f.endsWith('.cs'));

  if (hasCSharpProject) {
    // Use the .csproj or .sln file path for the project
    const projectFile = csprojFile || slnFile;
    const projectPath = projectFile ? `--project "${projectFile}"` : '';

    return {
      type: 'csharp',
      defaultPort: 5000,
      startCommand: `dotnet run ${projectPath}`.trim(),
      installCommand: `dotnet restore ${projectPath}`.trim(),
      description: 'C# / .NET Application',
      buildCommand: `dotnet build ${projectPath}`.trim()
    };
  }

  // C# script files without project file
  if (hasCSharpFiles) {
    return {
      type: 'csharp-script',
      defaultPort: 5000,
      startCommand: 'dotnet script Program.cs',
      installCommand: 'dotnet tool install -g dotnet-script',
      description: 'C# Script',
      buildCommand: null
    };
  }

  // Python (Django, Flask, FastAPI)
  if (files.includes('manage.py') && files.includes('wsgi.py')) {
    return {
      type: 'python-django',
      defaultPort: 8000,
      startCommand: 'python manage.py runserver 0.0.0.0:8000',
      installCommand: 'pip install -r requirements.txt',
      description: 'Django Application'
    };
  }

  if (files.some(f => f.includes('app.py') || f.includes('main.py'))) {
    // Check for Flask or FastAPI in requirements.txt
    const hasFlask = files.includes('requirements.txt'); // Simplified check
    return {
      type: 'python-web',
      defaultPort: 5000,
      startCommand: 'python app.py || python main.py',
      installCommand: 'pip install -r requirements.txt',
      description: 'Python Web Application (Flask/FastAPI)'
    };
  }

  // Java (Spring Boot)
  if (files.includes('pom.xml') || files.includes('build.gradle')) {
    const isMaven = files.includes('pom.xml');
    return {
      type: 'java-spring',
      defaultPort: 8080,
      startCommand: isMaven ? 'mvn spring-boot:run' : 'gradle bootRun',
      installCommand: isMaven ? 'mvn install' : 'gradle build',
      description: 'Java Spring Boot Application'
    };
  }

  // Go
  if (files.includes('go.mod') || files.some(f => f.endsWith('.go'))) {
    return {
      type: 'go',
      defaultPort: 8080,
      startCommand: 'go run .',
      installCommand: 'go mod download',
      description: 'Go Application',
      buildCommand: 'go build'
    };
  }

  // PHP (Laravel, Symfony)
  if (files.includes('artisan')) {
    return {
      type: 'php-laravel',
      defaultPort: 8000,
      startCommand: 'php artisan serve --host=0.0.0.0 --port=8000',
      installCommand: 'composer install',
      description: 'Laravel Application'
    };
  }

  if (files.includes('composer.json')) {
    return {
      type: 'php',
      defaultPort: 8000,
      startCommand: 'php -S 0.0.0.0:8000',
      installCommand: 'composer install',
      description: 'PHP Application'
    };
  }

  // Ruby (Rails, Sinatra)
  if (files.includes('Gemfile') && files.some(f => f.includes('config.ru'))) {
    return {
      type: 'ruby-rails',
      defaultPort: 3000,
      startCommand: 'rails server -b 0.0.0.0',
      installCommand: 'bundle install',
      description: 'Ruby on Rails Application'
    };
  }

  if (files.includes('Gemfile')) {
    return {
      type: 'ruby',
      defaultPort: 4567,
      startCommand: 'ruby app.rb',
      installCommand: 'bundle install',
      description: 'Ruby Application (Sinatra)'
    };
  }

  // Kotlin (Ktor, Spring Boot)
  if (files.includes('build.gradle.kts') || files.some(f => f.endsWith('.kt'))) {
    return {
      type: 'kotlin',
      defaultPort: 8080,
      startCommand: './gradlew run',
      installCommand: './gradlew build',
      description: 'Kotlin Application (Ktor/Spring Boot)',
      buildCommand: './gradlew build'
    };
  }

  // Rust (Actix, Rocket, Axum)
  if (files.includes('Cargo.toml') && files.some(f => f.endsWith('.rs'))) {
    return {
      type: 'rust',
      defaultPort: 8080,
      startCommand: 'cargo run',
      installCommand: 'cargo build',
      description: 'Rust Web Application',
      buildCommand: 'cargo build --release'
    };
  }

  // Swift (Vapor, Kitura)
  if (files.includes('Package.swift') && files.some(f => f.endsWith('.swift'))) {
    return {
      type: 'swift',
      defaultPort: 8080,
      startCommand: 'swift run',
      installCommand: 'swift build',
      description: 'Swift Web Application (Vapor/Kitura)',
      buildCommand: 'swift build -c release'
    };
  }

  // Elixir (Phoenix)
  if (files.includes('mix.exs')) {
    return {
      type: 'elixir-phoenix',
      defaultPort: 4000,
      startCommand: 'mix phx.server',
      installCommand: 'mix deps.get',
      description: 'Elixir Phoenix Application',
      buildCommand: 'mix compile'
    };
  }

  // Scala (Play Framework, Akka HTTP)
  if (files.includes('build.sbt') && files.some(f => f.endsWith('.scala'))) {
    return {
      type: 'scala',
      defaultPort: 9000,
      startCommand: 'sbt run',
      installCommand: 'sbt compile',
      description: 'Scala Application (Play/Akka)',
      buildCommand: 'sbt compile'
    };
  }

  // Dart server-side (Shelf, Aqueduct)
  if (files.includes('pubspec.yaml') && files.some(f => f.endsWith('.dart')) &&
      !files.some(f => f.includes('flutter'))) {
    return {
      type: 'dart-server',
      defaultPort: 8080,
      startCommand: 'dart run',
      installCommand: 'dart pub get',
      description: 'Dart Server Application',
      buildCommand: 'dart compile exe bin/server.dart'
    };
  }

  // Deno
  if (files.includes('deno.json') || files.includes('deno.jsonc') ||
      files.some(f => f.includes('deno.land'))) {
    return {
      type: 'deno',
      defaultPort: 8080,
      startCommand: 'deno run --allow-net --allow-read main.ts',
      installCommand: 'deno cache main.ts',
      description: 'Deno Application'
    };
  }

  // C/C++ (CMake)
  if (files.includes('CMakeLists.txt')) {
    return {
      type: 'cmake',
      defaultPort: 8080,
      startCommand: 'cmake --build build && ./build/main',
      installCommand: 'cmake -B build',
      description: 'C/C++ (CMake) Application',
      buildCommand: 'cmake --build build'
    };
  }

  // C/C++ (Makefile)
  if (files.includes('Makefile') && (files.some(f => f.endsWith('.c')) || files.some(f => f.endsWith('.cpp')))) {
    return {
      type: 'make',
      defaultPort: 8080,
      startCommand: 'make && ./main',
      installCommand: 'make',
      description: 'C/C++ (Makefile) Application',
      buildCommand: 'make'
    };
  }

  // C/C++ (single file)
  const cFile = files.find(f => f.endsWith('.c') && !f.includes('/'));
  const cppFile = files.find(f => (f.endsWith('.cpp') || f.endsWith('.cc') || f.endsWith('.cxx')) && !f.includes('/'));

  if (cppFile) {
    const outputName = cppFile.replace(/\.(cpp|cc|cxx)$/, '');
    return {
      type: 'cpp',
      defaultPort: null, // Console app, no web server
      startCommand: `g++ -o ${outputName} ${cppFile} && ./${outputName}`,
      installCommand: null,
      description: 'C++ Application',
      buildCommand: `g++ -o ${outputName} ${cppFile}`
    };
  }

  if (cFile) {
    const outputName = cFile.replace('.c', '');
    return {
      type: 'c',
      defaultPort: null, // Console app, no web server
      startCommand: `gcc -o ${outputName} ${cFile} && ./${outputName}`,
      installCommand: null,
      description: 'C Application',
      buildCommand: `gcc -o ${outputName} ${cFile}`
    };
  }

  // Bun
  if (files.includes('bun.lockb') || (packageJson?.dependencies?.['bun'] || packageJson?.devDependencies?.['bun'])) {
    return {
      type: 'bun',
      defaultPort: 8080,
      startCommand: 'bun run start',
      installCommand: 'bun install',
      description: 'Bun Application'
    };
  }

  // Static HTML (check at the end - no package.json, but has index.html)
  if (files.includes('index.html') && !packageJson) {
    // Use Node.js static server (works on all platforms, doesn't require Python)
    const serverPath = require('path').resolve(__dirname, 'static-server.js');

    return {
      type: 'static',
      defaultPort: 8000,
      startCommand: `node "${serverPath}" 8000 .`,
      description: 'Static HTML Site'
    };
  }

  return null;
}

function buildPreviewUrl(backendUrl, port) {
  const match = backendUrl.match(/https?:\/\/([^:]+)/);
  const ip = match ? match[1] : 'localhost';
  return `http://${ip}:${port}`;
}

module.exports = {
  detectProjectType,
  buildPreviewUrl
};
