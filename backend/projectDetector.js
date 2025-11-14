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
      defaultPort: 8082,  // Use 8082 to avoid conflict with main app on 8081
      startCommand: hasWebSupport ? 'npx expo start --web --port 8082' : 'npx expo start --port 8082',
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
