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
    return {
      type: 'react-native',
      defaultPort: 8081,
      startCommand: 'npx expo start --web --port 8081',
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

  // Static HTML (check at the end - no package.json, but has index.html)
  if (files.includes('index.html') && !packageJson) {
    return {
      type: 'static',
      defaultPort: 8000,
      startCommand: 'python3 -m http.server 8000',
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
