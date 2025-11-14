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
