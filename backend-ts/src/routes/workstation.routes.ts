import { Router } from 'express';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { verifyProjectOwnership, getUserPlan, getPlanProjectLimits, countUserProjects, getUserStorageMb, getLifetimeCreationCounts, incrementCreationCounter, decrementCreationCounter } from '../middleware/auth';
import { fileService } from '../services/file.service';
import { workspaceService } from '../services/workspace.service';
import { sessionService } from '../services/session.service';
import { aiProviderService } from '../services/ai-provider.service';
import { verifyAndFixProject } from '../services/verify-project.service';
import { firebaseService } from '../services/firebase.service';
import { config } from '../config';
import { log } from '../utils/logger';
import { auditService } from '../services/audit.service';
import { getProjectCreationSystemPrompt, getProjectCreationUserPrompt, getExcludedFiles } from '../services/project-creation-prompt';
import { supabaseManagementService, SupabaseCredentials } from '../services/supabase-management.service';
import { neonManagementService, NeonCredentials } from '../services/neon-management.service';
import { BuildReportTracker } from '../services/build-report.service';

async function applyBoilerplateTemplate(projectId: string, technology: string, cloudMode: boolean = false): Promise<boolean> {
  // Templates are in the backend root directory (synced via deploy), NOT inside Docker containers
  // __dirname at runtime is /opt/drape-backend/dist/routes/ → go up 2 levels to /opt/drape-backend/
  const backendRoot = path.resolve(__dirname, '..', '..');
  const templateDir = path.join(backendRoot, 'templates', technology);
  const cloudDir = path.join(backendRoot, 'templates', `${technology}-cloud`);
  const projectDir = path.join(config.projectsRoot, projectId);

  try {
    // Check if template exists
    if (!fs.existsSync(templateDir)) {
      log.info(`[Template] No boilerplate for ${technology}, will use AI generation`);
      return false;
    }

    // Copy base template files to project directory
    execSync(`cp -a ${templateDir}/. ${projectDir}/`, { timeout: 10000 });

    // If cloud mode enabled, overlay cloud files on top (merge package.json instead of overwrite)
    if (cloudMode && fs.existsSync(cloudDir)) {
      // Save base package.json before overlay
      const basePkgPath = path.join(projectDir, 'package.json');
      let basePkg: any = null;
      try { basePkg = JSON.parse(fs.readFileSync(basePkgPath, 'utf-8')); } catch {}

      execSync(`cp -a ${cloudDir}/. ${projectDir}/`, { timeout: 10000 });

      // Merge cloud package.json deps INTO base (base has all config deps, cloud adds DB/auth)
      if (basePkg) {
        try {
          const cloudPkgPath = path.join(projectDir, 'package.json');
          const cloudPkg = JSON.parse(fs.readFileSync(cloudPkgPath, 'utf-8'));
          const merged = {
            ...basePkg,
            dependencies: { ...basePkg.dependencies, ...cloudPkg.dependencies },
            devDependencies: { ...basePkg.devDependencies, ...cloudPkg.devDependencies },
            scripts: { ...basePkg.scripts, ...cloudPkg.scripts },
          };
          fs.writeFileSync(cloudPkgPath, JSON.stringify(merged, null, 2));
          log.info(`[Template] Merged package.json: base (${Object.keys(basePkg.dependencies || {}).length} deps) + cloud (${Object.keys(cloudPkg.dependencies || {}).length} deps)`);
        } catch (e: any) {
          log.warn(`[Template] package.json merge failed: ${e.message}`);
        }
      }
      log.info(`[Template] Applied cloud overlay for ${technology} to ${projectId}`);
    }

    // Copy pre-installed node_modules if available (saves ~20s on install)
    const preinstalledDir = `/usr/local/share/drape-preinstalled/${technology}`;
    const projectNodeModules = path.join(projectDir, 'node_modules');
    if (fs.existsSync(preinstalledDir) && !fs.existsSync(projectNodeModules)) {
      try {
        execSync(`cp -a ${preinstalledDir} ${projectNodeModules}`, { timeout: 30000 });
        log.info(`[Template] Copied pre-installed node_modules for ${technology} (~${Math.round(fs.readdirSync(preinstalledDir).length)} top-level packages)`);
      } catch (e: any) {
        log.warn(`[Template] Pre-installed copy failed (will install normally): ${e.message}`);
      }
    }

    // Fix ownership
    execSync(`chown -R 1000:1000 ${projectDir}`, { timeout: 10000 });

    log.info(`[Template] Applied boilerplate template for ${technology}${cloudMode ? ' + cloud' : ''} to ${projectId}`);
    return true;
  } catch (err: any) {
    log.warn(`[Template] Failed to apply template for ${technology}: ${err.message}`);
    return false;
  }
}

// In-memory task store for project creation
interface CreationTask {
  id: string;
  projectId: string;
  status: 'running' | 'completed' | 'failed' | 'verification_failed';
  progress: number;
  message: string;
  step: string;
  error?: string;
  result?: any;
}
const creationTasks = new Map<string, CreationTask>();
const deletionTasks = new Map<string, Promise<void>>();

async function performProjectDeletion(projectId: string, userId: string): Promise<void> {
  const startedAt = Date.now();

  // Clean up cloud database (Neon or Supabase) if exists
  try {
    const db = firebaseService.getFirestore();
    if (db) {
      const projectDoc = await db.collection('user_projects').doc(projectId).get();
      const data = projectDoc.data();

      if (data?.cloudDb?.provider === 'neon' && data.cloudDb.projectId) {
        log.info(`[Delete] Deleting Neon database ${data.cloudDb.projectId} for project ${projectId}`);
        await neonManagementService.deleteProject(data.cloudDb.projectId);
      } else if (data?.supabase?.projectRef) {
        log.info(`[Delete] Deleting Supabase project ${data.supabase.projectRef} for project ${projectId}`);
        await supabaseManagementService.deleteProject(data.supabase.projectRef);
      }
    }
  } catch (err: any) {
    log.warn(`[Delete] Cloud DB cleanup failed for ${projectId}: ${err.message}`);
  }

  const [releaseState, fileState] = await Promise.allSettled([
    workspaceService.release(projectId, userId),
    fileService.deleteProject(projectId),
  ] as const);

  if (releaseState.status === 'rejected') {
    log.warn(`[Delete] Release failed for ${userId}:${projectId}: ${String(releaseState.reason)}`);
  }

  if (fileState.status === 'fulfilled' && fileState.value?.success === false) {
    log.warn(`[Delete] File cleanup failed for ${userId}:${projectId}: ${fileState.value.error || 'unknown error'}`);
  }

  if (fileState.status === 'rejected') {
    log.warn(`[Delete] File cleanup threw for ${userId}:${projectId}: ${String(fileState.reason)}`);
  }

  const elapsed = Date.now() - startedAt;
  log.info(`[Delete] Completed cleanup for ${userId}:${projectId} in ${elapsed}ms`);
}

function scheduleProjectDeletion(projectId: string, userId: string): { scheduled: boolean; message: string } {
  const key = `${userId}:${projectId}`;
  if (deletionTasks.has(key)) {
    return { scheduled: false, message: 'Project deletion already in progress' };
  }

  const task = performProjectDeletion(projectId, userId)
    .catch((err: any) => {
      log.error(`[Delete] Async deletion failed for ${userId}:${projectId}: ${err?.message || err}`);
    })
    .finally(() => {
      deletionTasks.delete(key);
    });

  deletionTasks.set(key, task);
  return { scheduled: true, message: 'Project deletion scheduled' };
}

export const workstationRouter = Router();

type GeneratedFile = { path: string; content: string };

function sanitizePackageName(name: string): string {
  return (name || 'drape-app')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'drape-app';
}

function upsertFile(files: GeneratedFile[], path: string, content: string): void {
  const idx = files.findIndex((f) => f.path === path);
  if (idx >= 0) files[idx].content = content;
  else files.push({ path, content });
}

function normalizeGeneratedFiles(files: GeneratedFile[], technology: string, projectName: string): GeneratedFile[] {
  const blockedPrefixes = ['node_modules/', 'vendor/', '.dart_tool/'];
  const blockedExact = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

  const normalized = files
    .filter((f) => f && typeof f.path === 'string' && typeof f.content === 'string')
    .map((f) => ({ path: f.path.trim().replace(/^\/+/, ''), content: f.content }))
    .filter((f) => f.path && !blockedExact.has(f.path) && !blockedPrefixes.some((prefix) => f.path.startsWith(prefix)));

  const hasFile = (path: string) => normalized.some((f) => f.path === path);
  const ensureFile = (path: string, content: string) => {
    if (!hasFile(path)) upsertFile(normalized, path, content);
  };
  const ensureTextContains = (path: string, lines: string[]) => {
    const existing = normalized.find((f) => f.path === path);
    const base = existing?.content || '';
    const current = new Set(base.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    const missing = lines.filter((line) => !current.has(line));
    if (missing.length === 0 && existing) return;
    const next = [base.trim(), ...missing].filter(Boolean).join('\n') + '\n';
    upsertFile(normalized, path, next);
  };

  const nodeTech = new Set(['nextjs', 'react', 'vue', 'astro', 'expo']);
  if (nodeTech.has(technology)) {
    const packageFile = normalized.find((f) => f.path === 'package.json');
    const fallbackScripts: Record<string, string> = {
      nextjs: 'next dev -p 3000 -H 0.0.0.0',
      react: 'vite --host 0.0.0.0 --port 3000',
      vue: 'vite --host 0.0.0.0 --port 3000',
      astro: 'astro dev --host 0.0.0.0 --port 3000',
      expo: 'expo start --web --port 3000 --non-interactive',
    };

    const ensureDep = (pkg: any, scope: 'dependencies' | 'devDependencies', name: string, version: string) => {
      const existing = pkg[scope][name];
      // Override if missing or if existing version is a pre-release (rc, canary, alpha, beta, experimental)
      if (!existing || /-(rc|canary|alpha|beta|experimental|nightly)[\.-]/.test(existing)) {
        pkg[scope][name] = version;
      }
    };

    let pkg: any = {};
    try {
      pkg = packageFile ? JSON.parse(packageFile.content) : {};
    } catch {
      pkg = {};
    }

    pkg.name = typeof pkg.name === 'string' && pkg.name.trim() ? pkg.name : sanitizePackageName(projectName);
    pkg.private = true;
    pkg.version = typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version : '0.1.0';
    pkg.scripts = typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {};
    pkg.dependencies = typeof pkg.dependencies === 'object' && pkg.dependencies ? pkg.dependencies : {};
    pkg.devDependencies = typeof pkg.devDependencies === 'object' && pkg.devDependencies ? pkg.devDependencies : {};

    if (!pkg.scripts.dev) pkg.scripts.dev = fallbackScripts[technology] || 'npm run start';

    const hasTailwindSignals =
      technology !== 'html' &&
      (
        normalized.some((f) => /tailwind\.config|postcss\.config/i.test(f.path)) ||
        normalized.some((f) => /@tailwind|tailwindcss/i.test(f.content))
      );

    if (technology === 'nextjs') {
      if (!pkg.scripts.build) pkg.scripts.build = 'next build';
      if (!pkg.scripts.start) pkg.scripts.start = 'next start';
      ensureDep(pkg, 'dependencies', 'next', '^15.0.0');
      ensureDep(pkg, 'dependencies', 'react', '^19.0.0');
      ensureDep(pkg, 'dependencies', 'react-dom', '^19.0.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      ensureDep(pkg, 'devDependencies', '@types/node', '^20.0.0');
      ensureDep(pkg, 'devDependencies', '@types/react', '^19.0.0');
      ensureDep(pkg, 'devDependencies', '@types/react-dom', '^19.0.0');
      upsertFile(normalized, 'tsconfig.json', `{\n  "compilerOptions": {\n    "target": "ES2017",\n    "lib": ["dom", "dom.iterable", "esnext"],\n    "allowJs": true,\n    "skipLibCheck": true,\n    "strict": false,\n    "noEmit": true,\n    "esModuleInterop": true,\n    "module": "esnext",\n    "moduleResolution": "bundler",\n    "resolveJsonModule": true,\n    "isolatedModules": true,\n    "jsx": "preserve",\n    "incremental": true,\n    "plugins": [{ "name": "next" }],\n    "paths": { "@/*": ["./*"] }\n  },\n  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],\n  "exclude": ["node_modules"]\n}\n`);
      ensureFile('app/layout.tsx', `export default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="it">\n      <body>{children}</body>\n    </html>\n  );\n}\n`);
      ensureFile('app/page.tsx', `export default function HomePage() {\n  return (\n    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>\n      <h1>Benvenuto su ${projectName}</h1>\n      <p>Progetto Next.js pronto per la preview.</p>\n    </main>\n  );\n}\n`);
    }

    if (technology === 'react') {
      ensureDep(pkg, 'dependencies', 'react', '^18.2.0');
      ensureDep(pkg, 'dependencies', 'react-dom', '^18.2.0');
      ensureDep(pkg, 'devDependencies', 'vite', '^5.0.0');
      ensureDep(pkg, 'devDependencies', '@vitejs/plugin-react', '^4.0.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      ensureDep(pkg, 'devDependencies', '@types/react', '^18.2.0');
      ensureDep(pkg, 'devDependencies', '@types/react-dom', '^18.2.0');
      upsertFile(normalized, 'vite.config.ts', `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`);
      upsertFile(normalized, 'tsconfig.json', `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "useDefineForClassFields": true,\n    "lib": ["ES2020", "DOM", "DOM.Iterable"],\n    "module": "ESNext",\n    "skipLibCheck": true,\n    "moduleResolution": "bundler",\n    "allowImportingTsExtensions": true,\n    "isolatedModules": true,\n    "moduleDetection": "force",\n    "noEmit": true,\n    "strict": false,\n    "noUnusedLocals": false,\n    "noUnusedParameters": false,\n    "jsx": "react-jsx"\n  },\n  "include": ["src"]\n}\n`);
      upsertFile(normalized, 'index.html', `<!doctype html>\n<html lang="it">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`);
      ensureFile('src/main.tsx', `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`);
      ensureFile('src/App.tsx', `export default function App() {\n  return (\n    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>\n      <h1>Benvenuto su ${projectName}</h1>\n    </main>\n  );\n}\n`);
    }

    if (technology === 'vue') {
      ensureDep(pkg, 'dependencies', 'vue', '^3.4.0');
      ensureDep(pkg, 'devDependencies', 'vite', '^5.0.0');
      ensureDep(pkg, 'devDependencies', '@vitejs/plugin-vue', '^5.0.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      upsertFile(normalized, 'vite.config.ts', `import { defineConfig } from 'vite';\nimport vue from '@vitejs/plugin-vue';\n\nexport default defineConfig({\n  plugins: [vue()],\n});\n`);
      upsertFile(normalized, 'tsconfig.json', `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "module": "ESNext",\n    "moduleResolution": "bundler",\n    "strict": false,\n    "skipLibCheck": true,\n    "noEmit": true,\n    "jsx": "preserve",\n    "noUnusedLocals": false,\n    "noUnusedParameters": false\n  },\n  "include": ["src/**/*.ts", "src/**/*.vue"]\n}\n`);
      upsertFile(normalized, 'index.html', `<!doctype html>\n<html lang="it">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.ts"></script>\n  </body>\n</html>\n`);
      ensureFile('src/main.ts', `import { createApp } from 'vue';\nimport App from './App.vue';\n\ncreateApp(App).mount('#app');\n`);
      ensureFile('src/App.vue', `<template>\n  <main style="padding: 24px; font-family: system-ui, sans-serif;">\n    <h1>Benvenuto su ${projectName}</h1>\n  </main>\n</template>\n`);
    }

    if (technology === 'astro') {
      ensureDep(pkg, 'dependencies', 'astro', '^4.10.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      // Astro config — include @astrojs/tailwind integration when Tailwind is used
      if (hasTailwindSignals) {
        ensureDep(pkg, 'dependencies', '@astrojs/tailwind', '^5.1.0');
        upsertFile(normalized, 'astro.config.mjs', `import { defineConfig } from 'astro/config';\nimport tailwind from '@astrojs/tailwind';\n\nexport default defineConfig({\n  integrations: [tailwind()],\n});\n`);
      } else {
        upsertFile(normalized, 'astro.config.mjs', `import { defineConfig } from 'astro/config';\n\nexport default defineConfig({});\n`);
      }
      upsertFile(normalized, 'tsconfig.json', `{\n  "extends": "astro/tsconfigs/base",\n  "compilerOptions": {\n    "strict": false,\n    "skipLibCheck": true\n  }\n}\n`);
      ensureFile('src/pages/index.astro', `---\n---\n<html lang=\"it\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>${projectName}</title>\n  </head>\n  <body style=\"font-family: system-ui, sans-serif; padding: 24px;\">\n    <h1>Benvenuto su ${projectName}</h1>\n  </body>\n</html>\n`);
    }

    if (technology === 'expo') {
      pkg.main = 'expo/AppEntry';
      // Force correct Expo SDK — AI often generates outdated versions
      pkg.dependencies = pkg.dependencies || {};
      pkg.devDependencies = pkg.devDependencies || {};
      pkg.dependencies['expo'] = '^51.0.0';
      pkg.dependencies['react'] = '18.2.0';
      pkg.dependencies['react-dom'] = '18.2.0';
      pkg.dependencies['react-native'] = '0.74.5';
      pkg.dependencies['react-native-web'] = '~0.19.12';
      pkg.dependencies['@expo/metro-runtime'] = '~3.2.3';
      pkg.devDependencies['typescript'] = '^5.4.0';
      pkg.devDependencies['@types/react'] = '~18.2.45';
      upsertFile(normalized, 'app.json', `{\n  "expo": {\n    "name": "${projectName}",\n    "slug": "${sanitizePackageName(projectName)}",\n    "platforms": ["ios", "android", "web"],\n    "web": { "bundler": "metro" }\n  }\n}\n`);
      upsertFile(normalized, 'tsconfig.json', `{\n  "extends": "expo/tsconfig.base",\n  "compilerOptions": {\n    "strict": false,\n    "skipLibCheck": true\n  }\n}\n`);
      ensureFile('App.tsx', `import { Text, View, StyleSheet } from 'react-native';\n\nexport default function App() {\n  return (\n    <View style={styles.container}>\n      <Text style={styles.title}>Benvenuto su ${projectName}</Text>\n      <Text style={styles.subtitle}>Modifica App.tsx per iniziare</Text>\n    </View>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },\n  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },\n  subtitle: { fontSize: 16, color: '#666' },\n});\n`);
    }

    if (hasTailwindSignals || technology === 'nextjs') {
      ensureDep(pkg, 'devDependencies', 'tailwindcss', '^3.4.0');
      ensureDep(pkg, 'devDependencies', 'postcss', '^8.4.0');
      ensureDep(pkg, 'devDependencies', 'autoprefixer', '^10.4.0');
      const useESM = pkg.type === 'module'; // Svelte etc.
      if (useESM) {
        upsertFile(normalized, 'postcss.config.js', `export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`);
        upsertFile(normalized, 'tailwind.config.js', `/** @type {import('tailwindcss').Config} */\nexport default {\n  content: [\n    './src/**/*.{js,ts,jsx,tsx,vue,svelte,astro}',\n    './app/**/*.{js,ts,jsx,tsx}',\n    './pages/**/*.{js,ts,jsx,tsx}',\n    './components/**/*.{js,ts,jsx,tsx}',\n    './index.html',\n  ],\n  theme: { extend: {} },\n  plugins: [],\n};\n`);
      } else {
        upsertFile(normalized, 'postcss.config.js', `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`);
        upsertFile(normalized, 'tailwind.config.js', `/** @type {import('tailwindcss').Config} */\nmodule.exports = {\n  content: [\n    './src/**/*.{js,ts,jsx,tsx,vue,svelte,astro}',\n    './app/**/*.{js,ts,jsx,tsx}',\n    './pages/**/*.{js,ts,jsx,tsx}',\n    './components/**/*.{js,ts,jsx,tsx}',\n    './index.html',\n  ],\n  theme: { extend: {} },\n  plugins: [],\n};\n`);
      }
    }

    upsertFile(normalized, 'package.json', JSON.stringify(pkg, null, 2));
  }

  if (technology === 'html' || technology === 'HTML/CSS/JS') {
    ensureFile('index.html', `<!doctype html>\n<html lang=\"it\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>${projectName}</title>\n    <link rel=\"stylesheet\" href=\"style.css\" />\n  </head>\n  <body>\n    <main class=\"container\">\n      <h1>Benvenuto su ${projectName}</h1>\n      <p>Progetto statico pronto per la preview.</p>\n    </main>\n    <script src=\"script.js\"></script>\n  </body>\n</html>\n`);
    ensureFile('style.css', `body { margin: 0; font-family: system-ui, sans-serif; }\n.container { max-width: 960px; margin: 0 auto; padding: 24px; }\n`);
    ensureFile('script.js', `console.log('Project ${projectName} ready');\n`);
  }

  // --- Post-normalization: remove duplicate config file variants ---
  const viteTech = new Set(['react', 'vue']);
  if (viteTech.has(technology)) {
    const removeVariants = ['vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
    for (const variant of removeVariants) {
      const idx = normalized.findIndex((f) => f.path === variant);
      if (idx >= 0) normalized.splice(idx, 1);
    }
  }
  // Remove AI-generated tsconfig variants that conflict with our canonical tsconfig.json
  const tsconfigVariants = ['tsconfig.ts', 'tsconfig.mjs'];
  for (const variant of tsconfigVariants) {
    const idx = normalized.findIndex((f) => f.path === variant);
    if (idx >= 0) normalized.splice(idx, 1);
  }
  // Remove AI-generated tailwind/postcss variants if we already have canonical ones
  if (normalized.some((f) => f.path === 'tailwind.config.js')) {
    for (const variant of ['tailwind.config.ts', 'tailwind.config.mjs', 'tailwind.config.cjs']) {
      const idx = normalized.findIndex((f) => f.path === variant);
      if (idx >= 0) normalized.splice(idx, 1);
    }
  }
  if (normalized.some((f) => f.path === 'postcss.config.js')) {
    for (const variant of ['postcss.config.ts', 'postcss.config.mjs', 'postcss.config.cjs']) {
      const idx = normalized.findIndex((f) => f.path === variant);
      if (idx >= 0) normalized.splice(idx, 1);
    }
  }

  // --- Auto-detect missing dependencies from imports ---
  const nodeTechSet = new Set(['nextjs', 'react', 'vue', 'astro', 'expo']);
  if (nodeTechSet.has(technology)) {
    const pkgFile = normalized.find((f) => f.path === 'package.json');
    if (pkgFile) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const allDeps = new Set([
          ...Object.keys(pkg.dependencies || {}),
          ...Object.keys(pkg.devDependencies || {}),
        ]);
        const builtins = new Set([
          'fs', 'path', 'http', 'https', 'url', 'os', 'crypto', 'stream', 'util',
          'events', 'child_process', 'buffer', 'querystring', 'net', 'tls', 'assert',
          'zlib', 'readline', 'worker_threads', 'perf_hooks', 'dns', 'cluster',
          'node:fs', 'node:path', 'node:http', 'node:https', 'node:url', 'node:os',
          'node:crypto', 'node:stream', 'node:util', 'node:events', 'node:child_process',
          'node:buffer', 'node:querystring', 'node:net', 'node:tls', 'node:assert', 'node:zlib',
        ]);
        // Virtual / framework-specific modules that don't need to be in package.json
        const virtualModules = new Set([
          '~icons', 'virtual:',
        ]);
        const importRegex = /(?:import|from)\s+['"]([^./~#][^'"]*)['"]/g;
        let changed = false;
        for (const file of normalized) {
          if (!/\.(tsx?|jsx?|mjs|vue|svelte)$/.test(file.path)) continue;
          let match;
          while ((match = importRegex.exec(file.content)) !== null) {
            const raw = match[1];
            if (builtins.has(raw)) continue;
            if ([...virtualModules].some((v) => raw.startsWith(v))) continue;
            // Skip path aliases: @/ @app/ @lib/ @components/ @utils/ @styles/ etc.
            if (raw.startsWith('@/') || raw.startsWith('@app/') || raw.startsWith('@lib/') || raw.startsWith('@components/') || raw.startsWith('@utils/') || raw.startsWith('@styles/')) continue;
            const pkgName = raw.startsWith('@')
              ? raw.split('/').slice(0, 2).join('/')
              : raw.split('/')[0];
            if (!allDeps.has(pkgName)) {
              pkg.dependencies = pkg.dependencies || {};
              pkg.dependencies[pkgName] = '*';
              allDeps.add(pkgName);
              changed = true;
            }
          }
        }
        if (changed) {
          upsertFile(normalized, 'package.json', JSON.stringify(pkg, null, 2));
        }
      } catch {
        // package.json parse failed, skip auto-detect
      }
    }
  }

  return normalized;
}

// GET /workstation/:projectId/files
workstationRouter.get('/:projectId/files', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (list-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.listAllFiles(projectId);
  res.json({ success: true, files: result.data || [] });
}));

// GET /workstation/:projectId/project-history — aggregated history from all .drape files
workstationRouter.get('/:projectId/project-history', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const history: any = { projectId, buildReport: null, verificationReport: null, qaReport: null };

  // Tolerant JSON parse — handles trailing garbage from race conditions
  const safeParseJSON = (raw: string): any => {
    try { return JSON.parse(raw); } catch {
      // Try to extract the first valid JSON object
      const match = raw.match(/^\s*\{[\s\S]*?\n\}/);
      if (match) try { return JSON.parse(match[0]); } catch {}
      return null;
    }
  };

  // Read each file independently — never fail if one is missing
  const files = [
    { key: 'buildReport', path: '.drape/build-report.json' },
    { key: 'verificationReport', path: '.drape/verification-report.json' },
    { key: 'qaReport', path: '.drape/qa-report.json' },
  ];

  for (const { key, path: filePath } of files) {
    try {
      const result = await fileService.readFile(projectId, filePath);
      if (result.success && result.data) {
        const parsed = safeParseJSON(result.data.content);
        // Strip base64 screenshots to keep payload slim
        if (key === 'verificationReport' && parsed.backendVerification?.attempts) {
          for (const a of parsed.backendVerification.attempts) {
            if (a.pages) a.pages.forEach((p: any) => delete p.screenshot);
            if (a.navigation) a.navigation.forEach((n: any) => { delete n.screenshotBefore; delete n.screenshotAfter; });
          }
        }
        if (key === 'qaReport' && parsed.attempts) {
          for (const a of parsed.attempts) {
            if (a.pages) a.pages.forEach((p: any) => delete p.screenshot);
            if (a.clicks) a.clicks.forEach((c: any) => { delete c.screenshotBefore; delete c.screenshotAfter; });
          }
        }
        history[key] = parsed;
      }
    } catch {
      // Fallback: direct fs read for large files
      try {
        const { config: appConfig } = require('../config');
        const fullPath = require('path').join(appConfig.projectsRoot, projectId, filePath);
        if (require('fs').existsSync(fullPath)) {
          const raw = require('fs').readFileSync(fullPath, 'utf-8');
          if (raw.length < 5_000_000) { // Skip if > 5MB
            history[key] = JSON.parse(raw);
          }
        }
      } catch {}
    }
  }

  // If no build report but we have other data, synthesize minimal report
  if (!history.buildReport && (history.verificationReport || history.qaReport)) {
    history.buildReport = {
      projectId,
      projectName: projectId.replace('project-', ''),
      technology: 'unknown',
      cloudMode: false,
      createdAt: history.verificationReport?.createdAt || history.qaReport?.log?.[0]?.ts || new Date().toISOString(),
      status: 'completed',
      actions: [],
      summary: {
        filesGenerated: 0, filesProtected: 0, tablesCreated: [],
        seedRecords: 0, pagesVerified: 0, issuesFound: 0, issuesFixed: 0,
        aiModel: '', aiTokensUsed: 0,
      },
    };
    // Populate from QA report
    if (history.qaReport) {
      const lastAttempt = history.qaReport.attempts?.[history.qaReport.attempts.length - 1];
      history.buildReport.summary.pagesVerified = lastAttempt?.pages?.length || 0;
      history.buildReport.summary.issuesFound = history.qaReport.totalIssues || 0;
    }
  }

  const hasAnyData = history.buildReport || history.verificationReport || history.qaReport;
  res.json({ success: true, history: hasAnyData ? history : null });
}));

// GET /workstation/:projectId/build-report — get the build report for a project
workstationRouter.get('/:projectId/build-report', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const result = await fileService.readFile(projectId, '.drape/build-report.json');
  if (!result.success || !result.data) {
    return res.json({ success: true, report: null });
  }

  try {
    let report;
    try { report = JSON.parse(result.data.content); } catch {
      // Tolerant parse for truncated/corrupt JSON
      const match = (result.data.content || '').match(/^\s*\{[\s\S]*?\n\}/);
      if (match) report = JSON.parse(match[0]);
    }
    if (!report) return res.json({ success: true, report: null });
    res.json({ success: true, report });
  } catch {
    res.json({ success: true, report: null });
  }
}));

// GET /workstation/:projectId/screenshots — serve page screenshots from e2e-results.json
workstationRouter.get('/:projectId/screenshots', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) return res.status(403).json({ error: 'Access denied' });

  // Read from e2e-results.json (has full screenshots)
  const screenshots: Record<string, string> = {};
  try {
    const { config: appConfig } = require('../config');
    const e2ePath = require('path').join(appConfig.projectsRoot, projectId, '.drape', 'e2e-results.json');
    if (require('fs').existsSync(e2ePath)) {
      const raw = require('fs').readFileSync(e2ePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data.pages) {
        for (const pg of data.pages) {
          if (pg.screenshot && pg.path) screenshots[pg.path] = pg.screenshot;
        }
      }
    }
  } catch {}

  // Also try qa-report.json
  if (Object.keys(screenshots).length === 0) {
    try {
      const { config: appConfig } = require('../config');
      const qaPath = require('path').join(appConfig.projectsRoot, projectId, '.drape', 'qa-report.json');
      if (require('fs').existsSync(qaPath)) {
        const raw = require('fs').readFileSync(qaPath, 'utf-8');
        const data = JSON.parse(raw);
        const lastAttempt = data.attempts?.[data.attempts.length - 1];
        if (lastAttempt?.pages) {
          for (const pg of lastAttempt.pages) {
            if (pg.screenshot && pg.path) screenshots[pg.path] = pg.screenshot;
          }
        }
      }
    } catch {}
  }

  res.json({ success: true, screenshots });
}));

// GET /workstation/:projectId/verification-report
workstationRouter.get('/:projectId/verification-report', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const result = await fileService.readFile(projectId, '.drape/verification-report.json');
  if (!result.success || !result.data) {
    return res.json({ success: true, report: null });
  }

  try {
    const report = JSON.parse(result.data.content);
    res.json({ success: true, report });
  } catch {
    res.json({ success: true, report: null });
  }
}));

// POST /workstation/:projectId/verification-report
workstationRouter.post('/:projectId/verification-report', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId || 'anonymous';
  const { previewVerification } = req.body;

  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Read existing report and MERGE — never overwrite backendVerification/qaReport
  let report: any = null;

  // Try fileService first, fallback to direct fs read
  const existing = await fileService.readFile(projectId, '.drape/verification-report.json');
  if (existing.success && existing.data) {
    try { report = JSON.parse(existing.data.content); } catch {}
  }

  // Fallback: direct fs read (handles "file too large" from fileService)
  if (!report) {
    try {
      const { config: appConfig } = require('../config');
      const reportPath = require('path').join(appConfig.projectsRoot, projectId, '.drape', 'verification-report.json');
      if (require('fs').existsSync(reportPath)) {
        const raw = require('fs').readFileSync(reportPath, 'utf-8');
        report = JSON.parse(raw);
        log.info(`[Verify] Loaded verification report via direct fs fallback`);
      }
    } catch (fsErr: any) {
      log.warn(`[Verify] Cannot read existing verification report: ${fsErr.message?.substring(0, 80)}`);
    }
  }

  // If we still have no report, create minimal — but NEVER write a report that
  // overwrites backendVerification with null
  if (!report) {
    report = { projectId };
  }

  // Merge preview data — preserve ALL existing fields
  report.previewVerification = previewVerification;
  report.completedAt = new Date().toISOString();
  if (!report.projectId) report.projectId = projectId;

  // Write back — if report is too large, strip screenshots to fit
  let reportJson = JSON.stringify(report, null, 2);
  if (reportJson.length > 10_000_000) {
    // Strip base64 screenshots to reduce size
    if (report.backendVerification?.attempts) {
      for (const a of report.backendVerification.attempts) {
        if (a.pages) a.pages.forEach((p: any) => delete p.screenshot);
        if (a.navigation) a.navigation.forEach((n: any) => { delete n.screenshotBefore; delete n.screenshotAfter; });
      }
    }
    reportJson = JSON.stringify(report, null, 2);
    log.info(`[Verify] Stripped screenshots from report to reduce size (now ${Math.round(reportJson.length / 1024)}KB)`);
  }

  await fileService.writeFile(projectId, '.drape/verification-report.json', reportJson);
  res.json({ success: true });
}));

// POST /workstation/read-file
workstationRouter.post('/read-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, path: fp } = req.body;
  const file = filePath || fp;
  if (!projectId || !file) throw new ValidationError('projectId and filePath required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (read-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.readFile(projectId, file);
  if (!result.success) return res.status(404).json(result);

  res.json({
    success: true,
    content: result.data!.content,
    path: result.data!.path,
    size: result.data!.size,
    lines: result.data!.content.split('\n').length,
  });
}));

// POST /workstation/write-file
workstationRouter.post('/write-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, path: fp, content } = req.body;
  const file = filePath || fp;
  if (!projectId || !file) throw new ValidationError('projectId and filePath required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (write-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.writeFile(projectId, file, content || '');
  if (!result.success) return res.status(500).json(result);

  // Notify agent for hot reload
  const session = await sessionService.get(projectId, req.userId || 'anonymous');
  if (session?.agentUrl) {
    fileService.notifyAgent(session.agentUrl, file, content || '').catch(() => {});
  }

  res.json({ success: true, message: 'File written' });
}));

// POST /workstation/edit-file
workstationRouter.post('/edit-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, oldString, newString } = req.body;
  if (!projectId || !filePath || oldString === undefined) {
    throw new ValidationError('projectId, filePath, and oldString required');
  }

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (edit-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const readResult = await fileService.readFile(projectId, filePath);
  if (!readResult.success) return res.status(404).json(readResult);

  const content = readResult.data!.content;
  if (!content.includes(oldString)) {
    return res.status(400).json({ success: false, error: 'oldString not found in file' });
  }

  const replacement = newString || '';
  const newContent = content.replace(oldString, () => replacement);
  await fileService.writeFile(projectId, filePath, newContent);

  const session = await sessionService.get(projectId, req.userId || 'anonymous');
  if (session?.agentUrl) {
    fileService.notifyAgent(session.agentUrl, filePath, newContent).catch(() => {});
  }

  res.json({ success: true, message: 'File edited' });
}));

// POST /workstation/undo-file
workstationRouter.post('/undo-file', asyncHandler(async (req, res) => {
  const { projectId, filePath, content } = req.body;
  if (!projectId || !filePath) throw new ValidationError('projectId and filePath required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (undo-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  await fileService.writeFile(projectId, filePath, content || '');
  res.json({ success: true, message: 'File restored' });
}));

// POST /workstation/create-folder
workstationRouter.post('/create-folder', asyncHandler(async (req, res) => {
  const { projectId, folderPath } = req.body;
  if (!projectId || !folderPath) throw new ValidationError('projectId and folderPath required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (create-folder)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.createFolder(projectId, folderPath);
  res.json(result);
}));

// POST /workstation/delete-file
workstationRouter.post('/delete-file', asyncHandler(async (req, res) => {
  const { projectId, filePath } = req.body;
  if (!projectId || !filePath) throw new ValidationError('projectId and filePath required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (delete-file)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.deleteFile(projectId, filePath);
  auditService.log({ userId: req.userId || 'anonymous', action: 'file_delete', resource: projectId, details: `path: ${filePath}`, ip: req.ip });
  res.json(result);
}));

// POST /workstation/list-directory
workstationRouter.post('/list-directory', asyncHandler(async (req, res) => {
  const { projectId, directory } = req.body;
  if (!projectId) throw new ValidationError('projectId required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (list-directory)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.listFiles(projectId, directory || '');
  res.json({ success: true, files: result.data || [] });
}));

// POST /workstation/glob-files
workstationRouter.post('/glob-files', asyncHandler(async (req, res) => {
  const { projectId, pattern } = req.body;
  if (!projectId || !pattern) throw new ValidationError('projectId and pattern required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (glob-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.glob(projectId, pattern);
  res.json({ success: true, files: result.data || [] });
}));

// POST /workstation/search-files
workstationRouter.post('/search-files', asyncHandler(async (req, res) => {
  const { projectId, pattern } = req.body;
  log.info(`[Search] Received: projectId=${projectId} pattern=${pattern} userId=${req.userId}`);
  if (!projectId || !pattern) throw new ValidationError('projectId and pattern required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (search-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.grep(projectId, pattern);
  res.json({
    success: true,
    results: result.data || [],
    totalCount: result.data?.length || 0,
    truncated: false,
  });
}));

// GET /workstation/:projectId/search (legacy compatibility)
workstationRouter.get('/:projectId/search', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const query = typeof req.query.query === 'string' ? req.query.query : '';
  const pattern = typeof req.query.pattern === 'string' && req.query.pattern.trim().length > 0
    ? req.query.pattern
    : query;

  if (!projectId || !pattern) throw new ValidationError('projectId and query required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (legacy-search)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await fileService.grep(projectId, pattern);
  res.json({
    success: true,
    results: result.data || [],
    totalCount: result.data?.length || 0,
    truncated: false,
  });
}));

// POST /workstation/execute-command
workstationRouter.post('/execute-command', asyncHandler(async (req, res) => {
  const { projectId, command } = req.body;
  const uid = req.userId || 'anonymous';
  if (!projectId || !command) throw new ValidationError('projectId and command required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${uid} tried to access project ${projectId} without ownership (execute-command)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const result = await workspaceService.exec(projectId, uid, command);
  res.json({ success: true, ...result });
}));

// POST /workstation/read-multiple-files
workstationRouter.post('/read-multiple-files', asyncHandler(async (req, res) => {
  const { projectId, filePaths } = req.body;
  if (!projectId || !Array.isArray(filePaths)) throw new ValidationError('projectId and filePaths required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (read-multiple-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const results = await Promise.all(
    filePaths.map(async (fp: string) => {
      const r = await fileService.readFile(projectId, fp);
      return { path: fp, success: r.success, content: r.data?.content, error: r.error };
    })
  );

  res.json({
    success: true,
    results,
    totalFiles: results.length,
    successCount: results.filter(r => r.success).length,
  });
}));

// POST /workstation/edit-multiple-files
workstationRouter.post('/edit-multiple-files', asyncHandler(async (req, res) => {
  const { projectId, edits } = req.body;
  if (!projectId || !Array.isArray(edits)) throw new ValidationError('projectId and edits required');

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(req.userId || 'anonymous', projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${req.userId} tried to access project ${projectId} without ownership (edit-multiple-files)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const results = [];
  for (const edit of edits) {
    try {
      if (edit.type === 'write') {
        await fileService.writeFile(projectId, edit.filePath, edit.content || '');
        results.push({ path: edit.filePath, success: true });
      } else if (edit.type === 'edit') {
        const read = await fileService.readFile(projectId, edit.filePath);
        if (read.success && read.data) {
          const editReplacement = edit.newString || '';
          const newContent = read.data.content.replace(edit.oldString, () => editReplacement);
          await fileService.writeFile(projectId, edit.filePath, newContent);
          results.push({ path: edit.filePath, success: true });
        } else {
          results.push({ path: edit.filePath, success: false, error: 'File not found' });
        }
      }
    } catch (e: any) {
      results.push({ path: edit.filePath, success: false, error: e.message });
    }
  }

  res.json({ success: true, results, totalFiles: results.length });
}));

// DELETE /workstation/:projectId
workstationRouter.delete('/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.userId || 'anonymous';
  const forceAsync = ['1', 'true', 'yes'].includes(String(req.query.force || '').toLowerCase());

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership (delete-project)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  if (forceAsync) {
    const { scheduled, message } = scheduleProjectDeletion(projectId, userId);
    return res.json({
      success: true,
      queued: true,
      scheduled,
      message,
    });
  }

  await performProjectDeletion(projectId, userId);
  auditService.log({ userId, action: 'project_delete', resource: projectId, ip: req.ip });
  res.json({ success: true, message: 'Project deleted' });
}));

// POST /workstation/create
workstationRouter.post('/create', asyncHandler(async (req, res) => {
  const { projectId, repositoryUrl, githubToken, projectName } = req.body;
  if (!projectId) throw new ValidationError('projectId required');

  // Enforce project limits using lifetime creation counts (never reset on delete)
  const userId = req.userId || 'anonymous';
  if (userId !== 'anonymous') {
    const planId = await getUserPlan(userId);
    const limits = getPlanProjectLimits(planId);
    const lifetimeCounts = await getLifetimeCreationCounts(userId);
    const isClone = !!repositoryUrl;

    if (isClone && lifetimeCounts.cloned >= limits.maxCloned) {
      return res.status(403).json({
        success: false,
        error: 'PROJECT_LIMIT_EXCEEDED',
        limits: { maxProjects: limits.maxCloned, maxCloned: limits.maxCloned, current: lifetimeCounts.cloned },
        message: `Hai raggiunto il limite di ${limits.maxCloned} progetti clonati per il piano ${planId}`,
      });
    }
    if (!isClone && lifetimeCounts.created >= limits.maxCreated) {
      return res.status(403).json({
        success: false,
        error: 'PROJECT_LIMIT_EXCEEDED',
        limits: { maxProjects: limits.maxCreated, maxCloned: limits.maxCloned, current: lifetimeCounts.created },
        message: `Hai raggiunto il limite di ${limits.maxCreated} progetti creati per il piano ${planId}`,
      });
    }
    const storageMb = await getUserStorageMb(userId);
    if (storageMb >= limits.maxStorageMb) {
      return res.status(403).json({
        success: false,
        error: 'STORAGE_LIMIT_EXCEEDED',
        limits: { maxStorageMb: limits.maxStorageMb, usedMb: storageMb },
        message: `Hai raggiunto il limite di ${limits.maxStorageMb}MB di storage per il piano ${planId}`,
      });
    }
  }

  await fileService.ensureProjectDir(projectId);

  if (repositoryUrl) {
    const cloneTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Clone timeout after 45s')), 45000)
    );
    let cloneResult;
    try {
      cloneResult = await Promise.race([
        workspaceService.cloneRepository(projectId, repositoryUrl, githubToken),
        cloneTimeout,
      ]) as any;
    } catch (timeoutErr: any) {
      await fileService.deleteProject(projectId).catch(() => {});
      return res.status(408).json({
        success: false,
        error: 'CLONE_TIMEOUT',
        message: 'Clone timed out. The repository may be too large or unreachable.',
      });
    }
    if (!cloneResult.success) {
      await fileService.deleteProject(projectId).catch(() => {});
      return res.status(400).json({
        success: false,
        error: 'CLONE_FAILED',
        message: cloneResult.error || 'Failed to clone repository',
      });
    }
  }

  const files = await workspaceService.listFiles(projectId);

  if (repositoryUrl && files.length === 0) {
    await fileService.deleteProject(projectId).catch(() => {});
    return res.status(400).json({
      success: false,
      error: 'NO_FILES',
      message: 'No files found after cloning. The repository may be empty or the URL may be invalid.',
    });
  }

  // Increment lifetime creation counter only after successful clone
  const createType = repositoryUrl ? 'cloned' : 'created';
  incrementCreationCounter(userId, createType).catch(() => {});
  res.json({
    workstationId: projectId,
    status: 'active',
    message: 'Workstation created',
    repositoryUrl,
    filesCount: files.length,
    files,
  });
}));

// POST /workstation/create-with-template
workstationRouter.post('/create-with-template', asyncHandler(async (req, res) => {
  const { projectName, technology, description, projectId, agentMode, cloudEnabled } = req.body;
  if (!projectName) throw new ValidationError('projectName required');

  // Enforce project creation + storage limits using lifetime creation counts
  const userId = req.userId || 'anonymous';
  if (userId !== 'anonymous') {
    const planId = await getUserPlan(userId);
    const limits = getPlanProjectLimits(planId);
    const lifetimeCounts = await getLifetimeCreationCounts(userId);

    if (lifetimeCounts.created >= limits.maxCreated) {
      return res.status(403).json({
        success: false,
        error: 'PROJECT_LIMIT_EXCEEDED',
        limits: { maxProjects: limits.maxCreated, maxCloned: limits.maxCloned, current: lifetimeCounts.created },
        message: `Hai raggiunto il limite di ${limits.maxCreated} progetti creati per il piano ${planId}`,
      });
    }

    const storageMb = await getUserStorageMb(userId);
    if (storageMb >= limits.maxStorageMb) {
      return res.status(403).json({
        success: false,
        error: 'STORAGE_LIMIT_EXCEEDED',
        limits: { maxStorageMb: limits.maxStorageMb, usedMb: storageMb },
        message: `Hai raggiunto il limite di ${limits.maxStorageMb}MB di storage per il piano ${planId}`,
      });
    }
  }

  const id = projectId || `project-${Date.now()}`;
  await fileService.ensureProjectDir(id);

  // Apply boilerplate template to give AI a foundation to work with
  await applyBoilerplateTemplate(id, technology || 'nextjs', cloudEnabled === true);

  // Increment lifetime creation counter
  if (userId !== 'anonymous') {
    incrementCreationCounter(userId, 'created').catch(() => {});
  }

  // Write ownership record to Firestore so agent/stream can verify access
  try {
    const db = firebaseService.getFirestore();
    if (db && userId !== 'anonymous') {
      await db.collection('users').doc(userId).collection('projects').doc(id).set({
        projectId: id,
        name: projectName,
        technology: technology || 'nextjs',
        description: description || '',
        userId,
        status: 'creating',
        createdAt: new Date().toISOString(),
      }, { merge: true });
      log.info(`[CreateProject] Ownership record written for user ${userId}, project ${id}`);
    }
  } catch (err: any) {
    log.warn(`[CreateProject] Failed to write ownership record: ${err.message}`);
  }

  // Create task entry
  const task: CreationTask = {
    id, projectId: id, status: 'running', progress: 5,
    message: 'Connecting to AI Engine...', step: 'Initializing',
  };
  creationTasks.set(id, task);

  // Run generation in background (skip if agent mode — agent stream handles generation)
  if (!agentMode) {
    generateProject(id, projectName, technology || 'nextjs', description || '', task, userId, cloudEnabled === true).catch(err => {
      log.error(`[CreateProject] Failed: ${err.message}`);
      task.status = 'failed';
      task.error = err.message;
      task.message = 'Generation failed';
    });
  } else {
    task.message = 'Agent mode — generation handled by /agent/stream';
    task.step = 'AgentMode';
    log.info(`[CreateProject] Agent mode enabled for ${id}, skipping Gemini generation`);
  }

  res.json({ success: true, taskId: id, projectId: id, message: 'Template creation started' });
}));

// GET /workstation/templates
workstationRouter.get('/templates', (req, res) => {
  res.json({
    success: true,
    templates: [
      { id: 'nextjs', name: 'Next.js', description: 'React framework with SSR' },
      { id: 'vite-react', name: 'Vite + React', description: 'Fast React development' },
      { id: 'html', name: 'Static HTML', description: 'Simple HTML/CSS/JS' },
    ],
  });
});

// GET /workstation/create-status/:taskId
workstationRouter.get('/create-status/:taskId', asyncHandler(async (req, res) => {
  const task = creationTasks.get(req.params.taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }
  res.json({ success: true, task });
}));

/**
 * Background AI project generation using Gemini Flash
 */
async function generateProject(
  projectId: string, projectName: string, technology: string, description: string, task: CreationTask, userId: string, cloudMode: boolean = false
): Promise<void> {
  const update = (progress: number, message: string, step: string) => {
    const normalized = Math.max(0, Math.min(100, Math.round(progress)));
    // Keep progress monotonic to avoid visual jumps backwards.
    task.progress = Math.max(task.progress || 0, normalized);
    task.message = message;
    task.step = step;
  };

  // Initialize build report tracker
  const report = new BuildReportTracker(projectId, projectName, technology, cloudMode);

  update(2, 'Initializing project...', 'Setup');
  const templateActionId = report.startAction('setup', 'Applying template', `Technology: ${technology}, Cloud: ${cloudMode}`);
  const templateApplied = await applyBoilerplateTemplate(projectId, technology, cloudMode);
  report.completeAction(templateActionId, { technology, cloudMode, templateApplied });

  update(5, 'Template ready', 'Setup');
  const isCloudMode = cloudMode || (description ? /cloud\s*mode/i.test(description) : false);
  update(8, 'Preparing AI model...', 'Setup');

  // Create cloud database if Cloud Mode is enabled
  // Priority: Neon (fast, cheap) → Supabase (legacy) → SQLite (fallback)
  let supabaseCredentials: SupabaseCredentials | null = null;
  let neonCredentials: NeonCredentials | null = null;

  if (isCloudMode && neonManagementService.isConfigured) {
    const dbActionId = report.startAction('database', 'Creating Neon PostgreSQL database', `Region: eu-central-1`);
    try {
      update(10, 'Creating database...', 'Cloud Setup');
      neonCredentials = await neonManagementService.createProject(projectName, userId, (pct, msg) => {
        update(pct, msg, 'Cloud Setup');
      });
      report.completeAction(dbActionId, { host: neonCredentials.host, database: neonCredentials.database, projectId: neonCredentials.projectId });

      // Write .env file with Neon credentials + auth secret
      const envActionId = report.startAction('database', 'Writing environment variables', '8 variables: DATABASE_URL, AUTH_SECRET, etc.');
      const authSecret = crypto.randomBytes(32).toString('hex');
      // App URL env var name depends on the framework
      const appUrlKey = technology === 'nextjs' ? 'NEXT_PUBLIC_APP_URL'
        : (technology === 'html' ? 'APP_URL' : 'VITE_APP_URL');
      const envContent = [
        `DATABASE_URL=${neonCredentials.connectionUri}`,
        `DATABASE_URL_POOLED=${neonCredentials.connectionUriPooled}`,
        `PGHOST=${neonCredentials.host}`,
        `PGDATABASE=${neonCredentials.database}`,
        `PGUSER=${neonCredentials.role}`,
        `PGPASSWORD=${neonCredentials.password}`,
        `BETTER_AUTH_SECRET=${authSecret}`,
        `${appUrlKey}=http://localhost:3000`,
      ].join('\n');
      // Also write .env for stacks that don't use .env.local (Express, Astro)
      await fileService.writeFile(projectId, '.env.local', envContent);
      await fileService.writeFile(projectId, '.env', envContent);
      report.completeAction(envActionId);

      // Run auth schema to create user/session/account tables
      const authSchemaActionId = report.startAction('database', 'Creating auth tables', 'Tables: user, session, account, verification');
      try {
        // Auth schema is identical across all cloud templates — try the current stack first, fallback to nextjs
        const techCloudDir = path.resolve(__dirname, `../../templates/${technology}-cloud/db/auth-schema.sql`);
        const fallbackDir = path.resolve(__dirname, '../../templates/nextjs-cloud/db/auth-schema.sql');
        const authSchemaPath = fs.existsSync(techCloudDir) ? techCloudDir : fallbackDir;
        const authSchemaSql = fs.readFileSync(authSchemaPath, 'utf-8');
        await neonManagementService.runSQL(neonCredentials.projectId, authSchemaSql, neonCredentials.endpointId);
        report.completeAction(authSchemaActionId, { tables: ['user', 'session', 'account', 'verification'] });
        report.updateSummary({ tablesCreated: ['user', 'session', 'account', 'verification'] });
        log.info(`[CreateProject] Auth tables created in Neon`);
      } catch (err: any) {
        report.failAction(authSchemaActionId, err.message);
        log.warn(`[CreateProject] Auth schema failed (will retry after generation): ${err.message}`);
      }

      update(40, 'Database ready!', 'AI Generating');
      log.info(`[CreateProject] Neon database created: ${neonCredentials.host}`);
    } catch (err: any) {
      report.failAction(dbActionId, err.message);
      log.warn(`[CreateProject] Neon creation failed, trying Supabase fallback: ${err.message}`);
      neonCredentials = null;
    }
  }

  // Fallback to Supabase if Neon is not configured or failed
  if (isCloudMode && !neonCredentials && supabaseManagementService.isConfigured) {
    try {
      update(10, 'Creating Supabase database...', 'Cloud Setup');
      supabaseCredentials = await supabaseManagementService.createProject(projectName, userId, (pct, msg) => {
        update(pct, msg, 'Cloud Setup');
      });

      const envContent = [
        `NEXT_PUBLIC_SUPABASE_URL=${supabaseCredentials.url}`,
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseCredentials.anonKey}`,
        `SUPABASE_SERVICE_ROLE_KEY=${supabaseCredentials.serviceRoleKey}`,
        `SUPABASE_DB_PASSWORD=${supabaseCredentials.dbPassword}`,
      ].join('\n');
      await fileService.writeFile(projectId, '.env.local', envContent);

      update(40, 'Supabase ready!', 'AI Generating');
      log.info(`[CreateProject] Supabase project created: ${supabaseCredentials.url}`);
    } catch (err: any) {
      log.warn(`[CreateProject] Supabase creation failed, falling back to SQLite: ${err.message}`);
    }
  }

  const techMap: Record<string, string> = {
    nextjs: 'Next.js 15 with App Router, TypeScript, and Tailwind CSS',
    react: 'React with Vite, TypeScript, and Tailwind CSS',
    html: 'HTML5, CSS3, and vanilla JavaScript',
    vue: 'Vue 3 with Vite, TypeScript, and Tailwind CSS',
    astro: 'Astro with TypeScript and Tailwind CSS',
    expo: 'React Native with Expo, TypeScript, and React Navigation',
    'HTML/CSS/JS': 'HTML5, CSS3, and vanilla JavaScript',
  };
  const techDesc = techMap[technology] || techMap['nextjs'];

  update(15, 'Designing architecture...', 'AI Generating');

  // Build the list of config files the AI should NOT generate (they are auto-created by the template system)
  const excludedConfigFiles: Record<string, string[]> = {
    react: ['vite.config.ts', 'vite.config.js', 'tsconfig.json', 'postcss.config.js', 'postcss.config.mjs', 'tailwind.config.js', 'tailwind.config.ts', 'index.html'],
    vue: ['vite.config.ts', 'vite.config.js', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts', 'index.html'],
    astro: ['astro.config.mjs', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts'],
    nextjs: ['tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts'],
    expo: ['tsconfig.json', 'app.json'],
  };
  const excluded = excludedConfigFiles[technology] || [];
  const excludedNote = excluded.length > 0
    ? `\n- Do NOT include these files (they are auto-generated): ${excluded.join(', ')}`
    : '';

  const cloudDbType = neonCredentials ? 'Neon PostgreSQL' : supabaseCredentials ? 'Supabase' : 'SQLite';
  if (isCloudMode) log.info(`[Workstation] Cloud Mode detected for "${projectName}" — will enforce ${cloudDbType} database generation`);
  const cloudDbRequirements = isCloudMode ? `

CLOUD MODE — DATABASE REQUIRED:
You MUST include a SQLite database setup using better-sqlite3. This is MANDATORY, not optional.
1. Add "better-sqlite3": "^11.0.0" to package.json dependencies (and "@types/better-sqlite3": "^7.6.11" to devDependencies). Do NOT add path aliases like "@/lib" to dependencies — those are NOT npm packages.
2. Create a file "lib/db.ts" that:
   - Uses require syntax: const Database = require('better-sqlite3')
   - Opens/creates a database file at process.cwd() + '/data.db'
   - Creates schema tables with CREATE TABLE IF NOT EXISTS
   - Inserts seed data with INSERT OR IGNORE so the DB is not empty
   - Exports the db instance using module.exports = db
3. Create Next.js API routes (app/api/[resource]/route.ts) that require('../../../lib/db') and perform CRUD operations (GET list, POST create)
4. The main page MUST fetch data from these API routes and display it in a table or list
5. The data.db file will be auto-created in the project root when the code runs
6. NEVER use in-memory databases or mock/hardcoded data — ALL data must come from the SQLite .db file
7. Include at least 2 tables (e.g. users and posts) with 3-5 seed rows each
8. Do NOT use lucide-react or any icon library — use emoji or plain text for icons
` : '';

  const prompt = `Generate a complete ${techDesc} project called "${projectName}".
${description ? `Description: ${description}` : ''}
${cloudDbRequirements}
IMPORTANT: Return ONLY a valid JSON object with this exact structure:
{
  "files": [
    { "path": "relative/file/path.ext", "content": "file content here" }
  ]
}

Requirements:
- For HTML projects: do NOT include package.json, only include index.html, style.css, script.js
- For framework projects (Next.js, React, Vue, Astro, Expo): include package.json with project name "${projectName}" and all necessary dependencies
- Include a working main page with a professional, modern UI
- CRITICAL: Design mobile-first. The preview runs on a phone screen (390px wide). All layouts MUST look perfect on mobile first. Use responsive utilities (Tailwind: default styles for mobile, sm:/md:/lg: for larger screens. CSS: use min-width media queries). Never use fixed widths larger than 100%. Ensure tap targets are at least 44px. No horizontal scrolling. Use flexbox/grid with wrap. For Tailwind projects, start with mobile styles and enhance with breakpoint prefixes.
- Use Italian language for user-facing text where appropriate
- For Next.js: use App Router (app/ directory), include layout.tsx and page.tsx
- For Astro: use src/pages/ directory, include index.astro
- For React Native (Expo): include package.json with "main": "expo/AppEntry" and dependencies: expo, react, react-dom, react-native, react-native-web, @expo/metro-runtime. Include App.tsx with a main screen using StyleSheet, backgroundColor '#fff'. Must support web platform (expo start --web)
- For HTML: include index.html, style.css, script.js
- Make it immediately runnable with the dev server
- Do NOT include node_modules, lock files, vendor/, or .dart_tool/
- Keep it concise but functional${excludedNote}

CRITICAL RULES to avoid build errors:
- Do NOT use require() — use ES module import/export syntax only
- Do NOT import packages that are not in your package.json dependencies
- Do NOT use complex TypeScript generics, "as" type casts, or advanced type annotations — keep types simple
- Do NOT add "type": "module" to package.json
- Every import must reference a file you generated or a package listed in dependencies
- Do NOT generate empty files
- Use "export default function" for components
- For React/Next.js: always use JSX syntax in .tsx files
- For Vue: use <script setup lang="ts"> syntax
- Do NOT use icon libraries (lucide, heroicons, react-icons, @fortawesome, etc.) — use emoji or inline SVG for icons instead. Icon library imports break at runtime due to version mismatches.
- NEVER put path aliases like "@/lib", "@/components", or "@/utils" as dependencies in package.json — path aliases are NOT npm packages. Only real npm package names go in dependencies.
- Use relative imports (./Component) not alias imports (@/components/Component) unless Next.js
- For better-sqlite3: use require() syntax (const Database = require('better-sqlite3')) since it is a native module that doesn't support ESM. This is the ONE exception to the "no require" rule.

Return ONLY the JSON, no markdown fences, no explanation.`;

  // Protected files set — used during streaming to skip template files
  // Only protect files that MUST NOT change — config and auth plumbing
  const protectedFilesSet = new Set([
    'package.json', // handled by merge logic above
    'tsconfig.json', 'vite.config.ts', 'vite.config.js',
    'next.config.ts', 'next.config.js', 'postcss.config.mjs', 'postcss.config.js',
    'tailwind.config.ts', 'tailwind.config.js',
    'app/globals.css', // Tailwind v4 @import — AI often generates incompatible CSS
    'astro.config.mjs',
    'app.json',
    'index.html', // Vite entry point
    // Cloud auth plumbing — NEVER overwrite (all stacks)
    'lib/db.ts', 'lib/auth.ts', 'lib/auth-client.ts',
    'app/api/auth/[...all]/route.ts',
    'app/components/auth-provider.tsx',
    'middleware.ts', 'db/auth-schema.sql',
    // React/Vue cloud (Express backend)
    'server/index.js', 'server/db.js', 'server/auth.js',
    'src/lib/auth-client.ts', 'src/components/AuthProvider.tsx', 'src/components/UserMenu.tsx',
    'src/components/AuthProvider.vue', 'src/components/UserMenu.vue',
    // HTML cloud
    'server.js', 'db.js', 'auth.js', 'js/auth.js',
    // Astro cloud
    'src/lib/db.ts', 'src/lib/auth.ts', 'src/lib/auth-client.ts',
    'src/pages/api/auth/[...all].ts', 'src/middleware.ts',
  ]);

  const streamWrittenFiles: string[] = [];
  update(17, 'Starting AI generation...', 'AI Generating');

  // ═══ STEP 1: Architecture Planning (fast, small output) ═══
  update(15, 'Planning app architecture...', 'Planning');
  let architecturePlan = '';
  try {
    const archPrompt = `You are planning a ${technology} web application called "${projectName}".
User request: ${description}
${isCloudMode ? 'Cloud mode is enabled with PostgreSQL database and authentication.' : ''}

Return a JSON object with this EXACT structure:
{
  "pages": ["page1.tsx", "page2.tsx", ...],
  "components": ["Component1.tsx", "Component2.tsx", ...],
  "apiRoutes": ["api/route1/route.ts", ...],
  "dataModels": ["User", "Product", ...],
  "colorPalette": { "primary": "#hex", "background": "#hex", "surface": "#hex", "text": "#hex" },
  "appDescription": "One sentence describing the app's purpose and style"
}

Return ONLY the JSON, no markdown, no explanation. Plan 6-8 pages, 8-10 components, relevant API routes.`;

    const archStream = aiProviderService.chatStream('gemini-3-flash',
      [{ role: 'user', content: archPrompt }],
      undefined, 'Return only valid JSON.', { temperature: 0.2, maxTokens: 4000 }
    );
    for await (const chunk of archStream) {
      if (chunk.type === 'text') architecturePlan += chunk.text;
    }
    log.info(`[CreateProject] Architecture plan generated (${architecturePlan.length} chars)`);
  } catch (archErr: any) {
    log.warn(`[CreateProject] Architecture planning failed (non-fatal): ${archErr.message}`);
  }

  // ═══ STEP 2: Full Code Generation with architecture context ═══
  update(17, 'Generating code...', 'AI Generating');
  // Gemini 3 Flash for all generation steps
  const models = ['gemini-3-flash', 'gemini-3-flash', 'gemini-3-flash'];
  const systemPrompt = getProjectCreationSystemPrompt(technology, isCloudMode, supabaseCredentials, neonCredentials);
  const userPrompt = templateApplied
    ? getProjectCreationUserPrompt(technology, projectName, description, isCloudMode, supabaseCredentials, neonCredentials)
    : prompt;
  // Inject architecture plan into the user prompt for consistency
  const architectureContext = architecturePlan
    ? `\n\nARCHITECTURE PLAN (follow this structure exactly):\n${architecturePlan}\n\nGenerate ALL the files listed in the plan above. Use the exact color palette specified.`
    : '';
  const chatMessages = [{ role: 'user' as const, content: userPrompt + architectureContext }];
  const chatOptions = { temperature: 0.3, maxTokens: isCloudMode ? 100000 : 60000 };

  try {
    let fullText = '';

    // Try models with retry
    for (let attempt = 0; attempt < models.length; attempt++) {
      let generationTicker: ReturnType<typeof setInterval> | null = null;
      try {
        fullText = '';
        const stream = aiProviderService.chatStream(models[attempt], chatMessages, undefined, systemPrompt, chatOptions);

        const generationMessages = [
          'Analyzing project intent...',
          'Designing architecture...',
          'Preparing folder structure...',
          'Planning shared components...',
          'Generating base layout...',
          'Generating pages...',
          'Generating reusable UI blocks...',
          'Wiring navigation...',
          'Configuring routes...',
          'Configuring metadata...',
          'Adding responsive rules...',
          'Refining visual hierarchy...',
          'Writing styles...',
          'Adding accessibility attributes...',
          'Applying semantic HTML...',
          'Linking interactions...',
          'Aligning dependencies...',
          'Preparing configuration files...',
          'Validating entry points...',
          'Optimizing generated code...',
          'Running consistency checks...',
          'Harmonizing naming conventions...',
          'Final pass on structure...',
          'Preparing output payload...',
          'Completing generation...',
        ];

        const pickGenerationMessage = (elapsedSec: number, chunkCount: number): string => {
          const timeRatio = Math.min(1, elapsedSec / 60);
          const phaseIndex = Math.floor(timeRatio * (generationMessages.length - 1));
          // Slight forward bias while chunks arrive so text feels alive without short loops.
          const chunkBias = Math.min(2, Math.floor(chunkCount / 12));
          const idx = Math.min(generationMessages.length - 1, phaseIndex + chunkBias);
          return generationMessages[idx];
        };

        let chunkCount = 0;
        const streamStart = Date.now();

        // Asymptotic exponential progress (Uber/Lyft pattern):
        // - Uses 1 - e^(-t/τ) so it NEVER stops, just slows down naturally
        // - Chunk arrivals give a small forward boost
        // - Single ticker avoids competing progress emitters
        const AI_START = (neonCredentials || supabaseCredentials) ? 40 : 17;
        const AI_CEILING = 80; // reserve 80-100 for review, build check, install
        const TAU = (neonCredentials || supabaseCredentials) ? 50 : 35;

        generationTicker = setInterval(() => {
          const elapsed = (Date.now() - streamStart) / 1000;
          const range = AI_CEILING - AI_START;
          const timeProgress = AI_START + range * (1 - Math.exp(-elapsed / TAU));
          const chunkBonus = Math.min(5, chunkCount / 30);
          const progress = Math.min(AI_CEILING, Math.round(timeProgress + chunkBonus));
          const message = pickGenerationMessage(elapsed, chunkCount);
          update(progress, message, 'AI Generating');
        }, 600);

        // === STREAMING FILE EXTRACTION ===
        // Parse and write files AS they arrive in the stream, not after
        let extractionBuffer = '';

        const extractAndWriteFiles = async () => {
          // Try to find complete file objects in the accumulated text
          // Pattern: {"path":"...","content":"..."} — content may have escaped chars
          const fileRegex = /\{\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
          let match;
          const found: { path: string; content: string; fullMatch: string }[] = [];

          while ((match = fileRegex.exec(fullText)) !== null) {
            const filePath = match[1];
            if (streamWrittenFiles.includes(filePath)) continue; // Already written
            try {
              const content = JSON.parse(`"${match[2]}"`); // Unescape the content
              found.push({ path: filePath, content, fullMatch: match[0] });
            } catch { /* incomplete escape sequence, skip */ }
          }

          for (const file of found) {
            if (streamWrittenFiles.includes(file.path)) continue;
            // Merge package.json deps instead of skipping
            if (templateApplied && file.path === 'package.json') {
              try {
                const existingResult = await fileService.readFile(projectId, 'package.json');
                const existing = JSON.parse(existingResult.success ? (existingResult as any).data.content : '{}');
                const aiGenerated = JSON.parse(file.content);
                if (aiGenerated.dependencies) {
                  existing.dependencies = { ...existing.dependencies, ...aiGenerated.dependencies };
                }
                if (aiGenerated.devDependencies) {
                  existing.devDependencies = { ...existing.devDependencies, ...aiGenerated.devDependencies };
                }
                await fileService.writeFile(projectId, 'package.json', JSON.stringify(existing, null, 2));
                streamWrittenFiles.push(file.path);
              } catch (e) { /* merge failed, keep existing */ }
              continue;
            }
            // Skip other protected template files
            if (templateApplied && protectedFilesSet.has(file.path)) continue;
            // Quick inline fix: blocked icon libs
            let content = file.content;
            content = content.replace(/import\s+\{[^}]+\}\s+from\s+['"](?:lucide-react|@heroicons\/react[^'"]*|@fortawesome[^'"]*)['"]/g, '');
            content = content.replace(/import\s+(\w+)\s+from\s+['"]better-sqlite3['"]/g, "const $1 = require('better-sqlite3')");
            // Fix 'use client' — must be the VERY FIRST line, no exceptions
            if ((file.path.endsWith('.tsx') || file.path.endsWith('.jsx'))) {
              const hasHooks = /\b(useState|useEffect|useCallback|useMemo|useRef|useReducer|useContext|useRouter|useParams|useSearchParams|usePathname)\b/.test(content);
              const hasEvents = /\b(onClick|onChange|onSubmit|onPress)\b/.test(content);
              if (hasHooks || hasEvents) {
                // Remove any misplaced 'use client' not at top
                content = content.replace(/(['"]use client['"]\s*;?\s*\n?)/g, '');
                content = "'use client';\n\n" + content.trimStart();
              }
            }
            if (content.trim().length === 0) continue;
            await fileService.writeFile(projectId, file.path, content);
            streamWrittenFiles.push(file.path);
          }
        };

        let streamUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            fullText += chunk.text;
            chunkCount++;
            // Every ~20 chunks, try to extract files
            if (chunkCount % 20 === 0) {
              await extractAndWriteFiles();
              if (streamWrittenFiles.length > 0) {
                update(Math.min(AI_CEILING, AI_START + Math.floor((streamWrittenFiles.length / 20) * (AI_CEILING - AI_START))),
                  `Writing ${streamWrittenFiles[streamWrittenFiles.length - 1]}...`, 'Generating & Writing');
              }
            }
          }
          if (chunk.type === 'done' && chunk.usage) {
            streamUsage = {
              inputTokens: chunk.usage.inputTokens || 0,
              outputTokens: chunk.usage.outputTokens || 0,
              cachedTokens: (chunk.usage as any).cacheReadTokens || 0,
            };
          }
        }
        // Final extraction for any remaining files
        await extractAndWriteFiles();

        log.info(`[CreateProject] Tokens: model=${models[attempt]}, input=${streamUsage.inputTokens}, output=${streamUsage.outputTokens}`);

        if (generationTicker) {
          clearInterval(generationTicker);
          generationTicker = null;
        }
        update(80, `${streamWrittenFiles.length} files written`, 'Processing');
        log.info(`[CreateProject] Stream-wrote ${streamWrittenFiles.length} files during generation`);
        break; // Success — exit retry loop
      } catch (retryErr: any) {
        if (generationTicker) {
          clearInterval(generationTicker);
          generationTicker = null;
        }
        log.warn(`[CreateProject] Attempt ${attempt + 1} failed: ${retryErr.message}`);
        if (attempt === models.length - 1) throw retryErr;
        update(20, `Retrying generation (attempt ${attempt + 2})...`, 'AI Generating');
        await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
      }
    }

    // Parse any remaining files not caught by streaming extraction
    update(82, 'Processing remaining files...', 'Processing');
    let cleanJson = fullText.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');

    let parsed: { files: { path: string; content: string }[] } = { files: [] };
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      for (let i = cleanJson.lastIndexOf('}'); i > 0; i = cleanJson.lastIndexOf('}', i - 1)) {
        try {
          parsed = JSON.parse(cleanJson.substring(0, i + 1));
          break;
        } catch { /* try earlier brace */ }
      }
      if (!parsed) {
        // Last resort: find all complete file entries and reconstruct JSON
        const filePattern = /\{\s*"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
        const files: { path: string; content: string }[] = [];
        let m;
        while ((m = filePattern.exec(cleanJson)) !== null) {
          try {
            files.push({ path: m[1], content: JSON.parse(`"${m[2]}"`) });
          } catch { /* skip malformed entry */ }
        }
        if (files.length > 0) {
          parsed = { files };
          log.info(`[CreateProject] Recovered ${files.length} files from truncated JSON`);
        } else {
          throw new Error('AI returned invalid JSON — could not recover any files');
        }
      }
    }

    if (!parsed.files || !Array.isArray(parsed.files)) {
      throw new Error('AI response missing files array');
    }

    parsed.files = normalizeGeneratedFiles(parsed.files, technology, projectName);

    // If template was applied, protect critical template files from being overwritten
    if (templateApplied) {
      // Minimal protection — only config and cloud auth plumbing
      const protectedFiles = new Set([
        'package.json', // handled by merge logic
        'tsconfig.json', 'vite.config.ts', 'vite.config.js',
        'next.config.ts', 'next.config.js', 'postcss.config.mjs', 'postcss.config.js',
        'tailwind.config.ts', 'tailwind.config.js',
        'app/globals.css', // Tailwind v4 @import — AI often generates incompatible CSS
        'astro.config.mjs',
        'app.json',
        'index.html',
        // Cloud auth plumbing
        'lib/db.ts', 'lib/auth.ts', 'lib/auth-client.ts',
        'app/api/auth/[...all]/route.ts', 'app/components/auth-provider.tsx',
        'middleware.ts', 'db/auth-schema.sql',
        'server/db.js', 'database.py', 'src/lib/server/db.ts',
      ]);
      // Merge AI-generated package.json deps into existing before filtering
      const pkgFile = parsed.files.find(f => f.path === 'package.json');
      if (pkgFile) {
        try {
          const existingResult = await fileService.readFile(projectId, 'package.json');
                const existing = JSON.parse(existingResult.success ? (existingResult as any).data.content : '{}');
          const aiGenerated = JSON.parse(pkgFile.content);
          // Merge: AI deps go first, then template deps on top (template wins on conflicts)
          if (aiGenerated.dependencies) existing.dependencies = { ...aiGenerated.dependencies, ...existing.dependencies };
          if (aiGenerated.devDependencies) existing.devDependencies = { ...aiGenerated.devDependencies, ...existing.devDependencies };
          await fileService.writeFile(projectId, 'package.json', JSON.stringify(existing, null, 2));
          streamWrittenFiles.push('package.json');
        } catch (e) { /* merge failed, keep existing */ }
      }
      const before = parsed.files.length;
      parsed.files = parsed.files.filter(f => !protectedFiles.has(f.path));
      const dropped = before - parsed.files.length;
      if (dropped > 0) {
        log.info(`[CreateProject] Protected ${dropped} template files from AI overwrite`);
      }
    }

    // Write only files NOT already written during streaming
    update(84, 'Writing remaining files...', 'Processing');
    const writtenFiles: string[] = [...streamWrittenFiles];

    // Filter: skip protected, empty, already streamed
    const remainingFiles = (parsed.files || []).filter(f =>
      f.path && f.content && f.content.trim().length > 0 &&
      !streamWrittenFiles.includes(f.path) &&
      !(templateApplied && protectedFilesSet.has(f.path))
    );

    for (const file of remainingFiles) {
      // Quick inline fixes (same as streaming)
      let content = file.content;
      content = content.replace(/import\s+\{[^}]+\}\s+from\s+['"](?:lucide-react|@heroicons[^'"]*|@fortawesome[^'"]*)['"]/g, '');
      content = content.replace(/import\s+(\w+)\s+from\s+['"]better-sqlite3['"]/g, "const $1 = require('better-sqlite3')");
      // Fix 'use client' — must be the VERY FIRST line
      if ((file.path.endsWith('.tsx') || file.path.endsWith('.jsx'))) {
        const hasHooks = /\b(useState|useEffect|useCallback|useMemo|useRef|useReducer|useContext|useRouter|useParams|useSearchParams|usePathname)\b/.test(content);
        const hasEvents = /\b(onClick|onChange|onSubmit|onPress)\b/.test(content);
        if (hasHooks || hasEvents) {
          // Remove any misplaced 'use client' not at top
          content = content.replace(/(['"]use client['"]\s*;?\s*\n?)/g, '');
          content = "'use client';\n\n" + content.trimStart();
        }
      }
      await fileService.writeFile(projectId, file.path, content);
      writtenFiles.push(file.path);
    }

    log.info(`[CreateProject] Total files: ${writtenFiles.length} (${streamWrittenFiles.length} streamed + ${remainingFiles.length} post-stream)`);

    // Inject Tailwind CDN into layout as fallback (dev mode CSS depends on JS runtime)
    if (technology === 'nextjs') {
      try {
        const layoutResult = await fileService.readFile(projectId, 'app/layout.tsx');
        if (layoutResult.success && layoutResult.data?.content) {
          let layout = layoutResult.data.content;
          if (!layout.includes('cdn.tailwindcss.com')) {
            // Add next/script import if missing
            if (!layout.includes("from 'next/script'") && !layout.includes('from "next/script"')) {
              layout = "import Script from 'next/script';\n" + layout;
            }
            // Inject CDN script before {children}
            layout = layout.replace(
              /(\{children\})/,
              '<Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />\n        $1'
            );
            await fileService.writeFile(projectId, 'app/layout.tsx', layout);
            log.info(`[CreateProject] Injected Tailwind CDN into layout.tsx`);
          }
        }
      } catch (e: any) {
        log.warn(`[CreateProject] CDN injection into layout failed: ${e.message}`);
      }
    } else if (technology === 'react' || technology === 'vue') {
      try {
        const indexResult = await fileService.readFile(projectId, 'index.html');
        if (indexResult.success && indexResult.data?.content) {
          let html = indexResult.data.content;
          if (!html.includes('cdn.tailwindcss.com')) {
            html = html.replace('</head>', '    <script src="https://cdn.tailwindcss.com"></script>\n  </head>');
            await fileService.writeFile(projectId, 'index.html', html);
            log.info(`[CreateProject] Injected Tailwind CDN into index.html`);
          }
        }
      } catch (e: any) {
        log.warn(`[CreateProject] CDN injection into index.html failed: ${e.message}`);
      }
    }

    // Run database migrations if cloud credentials available
    let schemaFile = parsed.files.find(f =>
      f.path === 'supabase/schema.sql' || f.path === 'db/schema.sql' || f.path === 'schema.sql'
    );

    // Fallback: read schema.sql from disk if not found in parsed files (may have been streamed separately)
    if (!schemaFile) {
      for (const schemaPath of ['db/schema.sql', 'supabase/schema.sql', 'schema.sql']) {
        try {
          const diskResult = await fileService.readFile(projectId, schemaPath);
          if (diskResult.success && diskResult.data?.content) {
            schemaFile = { path: schemaPath, content: diskResult.data.content };
            log.info(`[CreateProject] Found schema file on disk: ${schemaPath}`);
            break;
          }
        } catch {}
      }
    }

    if (neonCredentials && schemaFile) {
      try {
        log.info(`[CreateProject] Running Neon schema migration (${schemaFile.path})...`);
        await neonManagementService.runSQL(neonCredentials.projectId, schemaFile.content, neonCredentials.endpointId);
        log.info(`[CreateProject] Neon schema applied successfully`);
      } catch (err: any) {
        log.warn(`[CreateProject] Neon migration failed: ${err.message}`);
      }
    } else if (supabaseCredentials && schemaFile) {
      try {
        log.info(`[CreateProject] Running Supabase schema migration...`);
        await supabaseManagementService.runSQL(supabaseCredentials.projectRef, schemaFile.content);
        log.info(`[CreateProject] Supabase schema applied successfully`);
      } catch (err: any) {
        log.warn(`[CreateProject] Supabase migration failed: ${err.message}`);
      }
    }

    // Run seed.sql if AI generated one (populate DB with realistic data)
    if (neonCredentials || supabaseCredentials) {
      for (const seedPath of ['db/seed.sql', 'seed.sql', 'supabase/seed.sql']) {
        try {
          const seedResult = await fileService.readFile(projectId, seedPath);
          if (seedResult.success && seedResult.data?.content) {
            const seedContent = seedResult.data.content;
            if (neonCredentials) {
              await neonManagementService.runSQL(neonCredentials.projectId, seedContent, neonCredentials.endpointId);
              log.info(`[CreateProject] Seed data applied from ${seedPath}`);
            } else if (supabaseCredentials) {
              await supabaseManagementService.runSQL(supabaseCredentials.projectRef, seedContent);
              log.info(`[CreateProject] Seed data applied from ${seedPath}`);
            }
            break;
          }
        } catch (err: any) {
          log.warn(`[CreateProject] Seed failed (${seedPath}): ${err.message}`);
        }
      }
    }

    // Save cloud database credentials to Firestore
    if (neonCredentials) {
      try {
        const db = firebaseService.getFirestore();
        if (db) {
          await db.collection('user_projects').doc(projectId).set({
            userId,
            cloudDb: {
              provider: 'neon',
              projectId: neonCredentials.projectId,
              host: neonCredentials.host,
              database: neonCredentials.database,
            }
          }, { merge: true });
        }
      } catch (err: any) {
        log.warn(`[CreateProject] Failed to save Neon credentials: ${err.message}`);
      }
    } else if (supabaseCredentials) {
      try {
        const db = firebaseService.getFirestore();
        if (db) {
          await db.collection('user_projects').doc(projectId).set({
            userId,
            supabase: {
              projectRef: supabaseCredentials.projectRef,
              url: supabaseCredentials.url,
              anonKey: supabaseCredentials.anonKey,
            }
          }, { merge: true });
        }
      } catch (err: any) {
        log.warn(`[CreateProject] Failed to save Supabase credentials: ${err.message}`);
      }
    }

    update(90, 'Starting workspace...', 'Building');

    // Collect env var names from .env.local
    let envVarNames: string[] = [];
    try {
      const envResult = await fileService.readFile(projectId, '.env.local');
      if (envResult.success && envResult.data) {
        envVarNames = envResult.data.content.split('\n')
          .filter(l => l.includes('=') && !l.startsWith('#'))
          .map(l => l.split('=')[0].trim())
          .filter(Boolean);
      }
    } catch {}

    // Collect app table names from schema migration
    const appTables = schemaFile
      ? (schemaFile.content.match(/CREATE TABLE[^(]*?(\w+)\s*\(/gi) || [])
          .map(m => m.replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?/i, '').replace(/\s*\(.*/, '').trim())
      : [];

    const allTables = [...(report.getReport().summary.tablesCreated || []), ...appTables];

    report.updateSummary({
      filesGenerated: writtenFiles.length,
      generatedFiles: writtenFiles,
      envVars: envVarNames,
      tablesCreated: [...new Set(allTables)],
    });
    log.info(`[CreateProject] Generated ${writtenFiles.length} files for ${projectName}`);

    // Pre-warm: create container + install deps + start dev server
    // If npm install fails (bad deps in package.json), fix and retry
    update(91, 'Installing dependencies...', 'Building');
    for (let warmAttempt = 0; warmAttempt < 3; warmAttempt++) {
      try {
        // Timeout warmProject at 90s to prevent blocking BuildCheck
        const warmTimeout = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('warmProject timeout (90s)')), 90000));
        await Promise.race([workspaceService.warmProject(projectId, userId), warmTimeout]);
        break; // Success
      } catch (warmErr: any) {
        const errMsg = warmErr.message || '';
        log.warn(`[CreateProject] Warm attempt ${warmAttempt + 1} failed: ${errMsg}`);

        // Check if it's a dependency resolution error
        if (errMsg.includes('failed to resolve') || errMsg.includes('404') || errMsg.includes('ERESOLVE')) {
          update(91, `Fixing dependencies (attempt ${warmAttempt + 1})...`, 'Fixing');
          try {
            // Read current package.json and remove bad deps
            const pkgResult = await fileService.readFile(projectId, 'package.json');
            if (pkgResult.success && pkgResult.data?.content) {
              const pkg = JSON.parse(pkgResult.data.content);
              let fixed = false;
              for (const depType of ['dependencies', 'devDependencies']) {
                if (pkg[depType]) {
                  for (const [name] of Object.entries(pkg[depType])) {
                    // Remove path aliases and other non-npm deps
                    if (name.startsWith('@/') || name === '@/app' || name === '@/lib' ||
                        name.startsWith('@app') || name.startsWith('@lib') ||
                        name.startsWith('@components') || name.startsWith('@utils')) {
                      delete pkg[depType][name];
                      fixed = true;
                      log.info(`[CreateProject] Removed bad dep: ${name}`);
                    }
                  }
                }
              }
              if (fixed) {
                await fileService.writeFile(projectId, 'package.json', JSON.stringify(pkg, null, 2));
              }
            }
          } catch (fixErr: any) {
            log.warn(`[CreateProject] Dep fix failed: ${fixErr.message}`);
          }
          continue; // Retry warmProject
        }
        // Non-dep error, don't retry
        break;
      }
    }

    // === NEXT.JS BUILD (production mode — pre-compile all pages) ===
    // Build MUST succeed — no fallback to dev mode. If it fails, fix errors and retry.
    if (technology === 'nextjs') {
      const MAX_BUILD_ATTEMPTS = 3;
      for (let buildAttempt = 1; buildAttempt <= MAX_BUILD_ATTEMPTS; buildAttempt++) {
        update(92, buildAttempt === 1 ? 'Building for production...' : `Rebuilding (attempt ${buildAttempt})...`, 'Building');
        try {
          // Clear previous failed build
          await workspaceService.exec(projectId, userId, 'rm -rf /home/coder/project/.next 2>/dev/null');

          const buildResult = await workspaceService.exec(projectId, userId,
            'cd /home/coder/project && timeout 120 ./node_modules/.bin/next build 2>&1'
          );
          const buildOutput = buildResult.stdout || '';
          const buildFailed = buildOutput.includes('Build error') ||
            buildOutput.includes('Failed to compile') ||
            buildOutput.includes('Module not found') ||
            buildOutput.includes("Can't resolve") ||
            buildOutput.includes('Type error');

          if (!buildFailed) {
            log.info(`[CreateProject] Next.js build succeeded on attempt ${buildAttempt}`);
            break;
          }

          log.warn(`[CreateProject] Next.js build failed (attempt ${buildAttempt}/${MAX_BUILD_ATTEMPTS}): ${buildOutput.substring(buildOutput.lastIndexOf('Error'), buildOutput.lastIndexOf('Error') + 200)}`);

          if (buildAttempt < MAX_BUILD_ATTEMPTS) {
            // Auto-fix: send build errors to AI
            update(93, 'Fixing build errors...', 'Auto-Fix');
            try {
              const fixStream = aiProviderService.chatStream('gemini-3-flash',
                [{ role: 'user', content: `Fix these Next.js build errors. Return ONLY a JSON array of fixed files: [{"path":"...","content":"..."}]\n\nBuild output:\n${buildOutput.slice(-3000)}\n\nRules:\n- Return COMPLETE file content\n- Fix all import errors, type errors, missing modules\n- Add 'use client' if needed\n- Do NOT modify package.json, layout.tsx, globals.css` }],
                undefined, 'Fix build errors. Return only valid JSON.', { temperature: 0.1, maxTokens: 30000 }
              );
              let fixText = '';
              for await (const chunk of fixStream) {
                fixText += typeof chunk === 'string' ? chunk : (chunk.type === 'text' ? chunk.text : '');
              }
              const fixMatch = fixText.match(/\[[\s\S]*\]/);
              if (fixMatch) {
                const fixes: { path: string; content: string }[] = JSON.parse(fixMatch[0]);
                for (const fix of fixes) {
                  if (fix.path && fix.content?.trim()) {
                    await fileService.writeFile(projectId, fix.path, fix.content);
                    log.info(`[CreateProject] Build fix: ${fix.path}`);
                  }
                }
              }
            } catch (fixErr: any) {
              log.warn(`[CreateProject] Build auto-fix failed: ${fixErr.message}`);
            }
          }
        } catch (buildErr: any) {
          log.warn(`[CreateProject] Build attempt ${buildAttempt} error: ${buildErr.message}`);
        }
      }
    }

    // === VERIFY + AUTO-FIX (blocking — preview NOT available until this completes) ===
    update(92, 'Verifying preview...', 'Verify');
    const qaActionId = report.startAction('qa', 'QA Verification — functional + visual testing');

    const verifyResult = await verifyAndFixProject({
      projectId,
      userId,
      technology,
      onProgress: (pct, msg, stage) => update(pct, msg, stage),
    });

    // Log QA results to build report
    if (verifyResult.qaReport) {
      report.completeAction(qaActionId, {
        qaStatus: verifyResult.qaReport.status,
        qualityScore: verifyResult.qaReport.qualityScore,
        attempts: verifyResult.qaReport.attempts?.length || 0,
        totalIssues: verifyResult.qaReport.totalIssues || 0,
      });
      report.updateQaSummary(verifyResult.qaReport);
    } else {
      report.completeAction(qaActionId);
    }

    // Quality gate — preview blocked if verification fails
    const qaStatus = verifyResult.qaReport?.status;
    const qaScore = verifyResult.qaReport?.qualityScore ?? 0;

    if (verifyResult.passed) {
      report.setPreviewBlocked(false);
      report.complete();
      update(100, 'Project Created Successfully!', 'Complete');
      task.status = 'completed';
    } else {
      report.setPreviewBlocked(true);
      report.fail();
      const reason = `${verifyResult.errors.length} errors — ${verifyResult.errors.slice(0, 2).join('; ')}`;
      update(100, `Verification failed: ${reason}`, 'Needs Fix');
      task.status = 'verification_failed';
      task.error = reason;
      log.warn(`[CreateProject] ${projectId} verification failed: ${reason}`);
    }

    task.result = {
      projectId,
      projectName,
      technology,
      templateDescription: description,
      files: writtenFiles,
      qaGate: {
        passed: verifyResult.passed,
        status: qaStatus || (verifyResult.passed ? 'passed' : 'failed'),
        qualityScore: qaScore,
        totalIssues: verifyResult.qaReport?.totalIssues || verifyResult.errors.length,
      },
    };

    // Clean up task after 5 minutes
    setTimeout(() => creationTasks.delete(projectId), 5 * 60 * 1000);
  } catch (err: any) {
    log.error(`[CreateProject] AI generation failed: ${err.message}`);
    task.status = 'failed';
    task.error = err.message;
    task.message = `Generation failed: ${err.message}`;
  }
}
