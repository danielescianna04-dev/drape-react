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

    // Fix ownership
    execSync(`chown -R 1000:1000 ${projectDir}`, { timeout: 5000 });

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
  status: 'running' | 'completed' | 'failed';
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

function sanitizePythonModuleName(name: string): string {
  return (name || 'drape_project')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z_]+/, '')
    .replace(/_+/g, '_')
    .slice(0, 48) || 'drape_project';
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

  const nodeTech = new Set(['nextjs', 'react', 'vue', 'nuxt', 'svelte', 'angular', 'astro', 'remix', 'solid', 'expo']);
  if (nodeTech.has(technology)) {
    const packageFile = normalized.find((f) => f.path === 'package.json');
    const fallbackScripts: Record<string, string> = {
      nextjs: 'next dev -p 3000 -H 0.0.0.0',
      react: 'vite --host 0.0.0.0 --port 3000',
      vue: 'vite --host 0.0.0.0 --port 3000',
      nuxt: 'nuxt dev --host 0.0.0.0 --port 3000',
      svelte: 'vite --host 0.0.0.0 --port 3000',
      angular: 'ng serve --host 0.0.0.0 --port 3000',
      astro: 'astro dev --host 0.0.0.0 --port 3000',
      remix: 'remix vite:dev --host 0.0.0.0 --port 3000',
      solid: 'vite --host 0.0.0.0 --port 3000',
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

    if (technology === 'nuxt') {
      ensureDep(pkg, 'dependencies', 'nuxt', '^3.12.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      if (hasTailwindSignals) {
        ensureDep(pkg, 'devDependencies', '@nuxtjs/tailwindcss', '^6.12.0');
        upsertFile(normalized, 'nuxt.config.ts', `export default defineNuxtConfig({\n  devtools: { enabled: false },\n  modules: ['@nuxtjs/tailwindcss'],\n});\n`);
      } else {
        upsertFile(normalized, 'nuxt.config.ts', `export default defineNuxtConfig({\n  devtools: { enabled: false }\n});\n`);
      }
      upsertFile(normalized, 'tsconfig.json', `{\n  "extends": "./.nuxt/tsconfig.json",\n  "compilerOptions": {\n    "strict": false,\n    "skipLibCheck": true\n  }\n}\n`);
      ensureFile('app.vue', `<template>\n  <main style="padding: 24px; font-family: system-ui, sans-serif;">\n    <h1>Benvenuto su ${projectName}</h1>\n  </main>\n</template>\n`);
    }

    if (technology === 'svelte') {
      pkg.type = 'module'; // @sveltejs/vite-plugin-svelte v3+ is ESM-only
      ensureDep(pkg, 'dependencies', 'svelte', '^4.2.0');
      ensureDep(pkg, 'devDependencies', 'vite', '^5.0.0');
      ensureDep(pkg, 'devDependencies', '@sveltejs/vite-plugin-svelte', '^3.0.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      upsertFile(normalized, 'vite.config.ts', `import { defineConfig } from 'vite';\nimport { svelte } from '@sveltejs/vite-plugin-svelte';\n\nexport default defineConfig({\n  plugins: [svelte()],\n});\n`);
      upsertFile(normalized, 'tsconfig.json', `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "useDefineForClassFields": true,\n    "module": "ESNext",\n    "skipLibCheck": true,\n    "moduleResolution": "bundler",\n    "allowImportingTsExtensions": true,\n    "isolatedModules": true,\n    "moduleDetection": "force",\n    "noEmit": true,\n    "strict": false,\n    "noUnusedLocals": false,\n    "noUnusedParameters": false\n  },\n  "include": ["src"]\n}\n`);
      upsertFile(normalized, 'index.html', `<!doctype html>\n<html lang="it">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="app"></div>\n    <script type="module" src="/src/main.ts"></script>\n  </body>\n</html>\n`);
      ensureFile('src/main.ts', `import App from './App.svelte';\n\nconst app = new App({\n  target: document.getElementById('app')!,\n});\n\nexport default app;\n`);
      // If AI generated SvelteKit routes instead of plain Svelte, rescue the content
      const pageFile = normalized.find(f => f.path === 'src/routes/+page.svelte');
      const appFile = normalized.find(f => f.path === 'src/App.svelte');
      if (pageFile && !appFile) {
        // Move +page.svelte content to App.svelte
        upsertFile(normalized, 'src/App.svelte', pageFile.content);
        // Remove SvelteKit route files
        for (let i = normalized.length - 1; i >= 0; i--) {
          if (normalized[i].path.startsWith('src/routes/')) normalized.splice(i, 1);
        }
      }
      ensureFile('src/App.svelte', `<main style="padding: 24px; font-family: system-ui, sans-serif;">\n  <h1>Benvenuto su ${projectName}</h1>\n</main>\n`);
    }

    if (technology === 'angular') {
      ensureDep(pkg, 'dependencies', '@angular/core', '^18.0.0');
      ensureDep(pkg, 'dependencies', '@angular/common', '^18.0.0');
      ensureDep(pkg, 'dependencies', '@angular/platform-browser', '^18.0.0');
      ensureDep(pkg, 'dependencies', 'rxjs', '^7.8.0');
      ensureDep(pkg, 'dependencies', 'zone.js', '^0.14.0');
      ensureDep(pkg, 'devDependencies', '@angular/cli', '^18.0.0');
      ensureDep(pkg, 'devDependencies', '@angular/compiler-cli', '^18.0.0');
      ensureDep(pkg, 'devDependencies', '@angular-devkit/build-angular', '^18.0.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      upsertFile(normalized, 'angular.json', `{\n  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",\n  "version": 1,\n  "projects": {\n    "app": {\n      "projectType": "application",\n      "root": "",\n      "sourceRoot": "src",\n      "architect": {\n        "build": {\n          "builder": "@angular-devkit/build-angular:application",\n          "options": {\n            "outputPath": "dist",\n            "browser": "src/main.ts",\n            "index": "src/index.html",\n            "polyfills": ["zone.js"],\n            "tsConfig": "tsconfig.app.json"\n          }\n        },\n        "serve": {\n          "builder": "@angular-devkit/build-angular:dev-server",\n          "options": { "buildTarget": "app:build" }\n        }\n      }\n    }\n  }\n}\n`);
      upsertFile(normalized, 'tsconfig.json', `{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "ES2022",\n    "moduleResolution": "bundler",\n    "strict": false,\n    "skipLibCheck": true\n  }\n}\n`);
      upsertFile(normalized, 'tsconfig.app.json', `{\n  "extends": "./tsconfig.json",\n  "compilerOptions": {\n    "types": []\n  },\n  "files": ["src/main.ts"]\n}\n`);
      ensureFile('src/index.html', `<!doctype html>\n<html lang=\"it\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <app-root></app-root>\n  </body>\n</html>\n`);
      ensureFile('src/main.ts', `import { bootstrapApplication } from '@angular/platform-browser';\nimport { Component } from '@angular/core';\n\n@Component({\n  selector: 'app-root',\n  standalone: true,\n  template: '<main style=\"padding:24px;font-family:system-ui,sans-serif\"><h1>Benvenuto su ${projectName}</h1></main>'\n})\nclass AppComponent {}\n\nbootstrapApplication(AppComponent).catch((err) => console.error(err));\n`);
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

    if (technology === 'remix') {
      ensureDep(pkg, 'dependencies', '@remix-run/react', '^2.0.0');
      ensureDep(pkg, 'dependencies', '@remix-run/node', '^2.0.0');
      ensureDep(pkg, 'dependencies', 'react', '^18.2.0');
      ensureDep(pkg, 'dependencies', 'react-dom', '^18.2.0');
      ensureDep(pkg, 'devDependencies', '@remix-run/dev', '^2.0.0');
      ensureDep(pkg, 'devDependencies', 'vite', '^5.0.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      ensureDep(pkg, 'devDependencies', '@types/react', '^18.2.0');
      ensureDep(pkg, 'devDependencies', '@types/react-dom', '^18.2.0');
      upsertFile(normalized, 'vite.config.ts', `import { vitePlugin as remix } from '@remix-run/dev';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({\n  plugins: [remix()],\n});\n`);
      upsertFile(normalized, 'tsconfig.json', `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "useDefineForClassFields": true,\n    "lib": ["ES2020", "DOM", "DOM.Iterable"],\n    "module": "ESNext",\n    "skipLibCheck": true,\n    "moduleResolution": "bundler",\n    "allowImportingTsExtensions": true,\n    "isolatedModules": true,\n    "moduleDetection": "force",\n    "noEmit": true,\n    "strict": false,\n    "noUnusedLocals": false,\n    "noUnusedParameters": false,\n    "jsx": "react-jsx"\n  },\n  "include": ["app"]\n}\n`);
      ensureFile('app/root.tsx', `import { Links, Meta, Outlet, Scripts } from '@remix-run/react';\n\nexport default function App() {\n  return (\n    <html lang=\"it\">\n      <head>\n        <Meta />\n        <Links />\n      </head>\n      <body>\n        <Outlet />\n        <Scripts />\n      </body>\n    </html>\n  );\n}\n`);
      ensureFile('app/routes/_index.tsx', `export default function IndexRoute() {\n  return (\n    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>\n      <h1>Benvenuto su ${projectName}</h1>\n    </main>\n  );\n}\n`);
    }

    if (technology === 'solid') {
      ensureDep(pkg, 'dependencies', 'solid-js', '^1.8.0');
      ensureDep(pkg, 'devDependencies', 'vite', '^5.0.0');
      ensureDep(pkg, 'devDependencies', 'vite-plugin-solid', '^2.9.0');
      ensureDep(pkg, 'devDependencies', 'typescript', '^5.4.0');
      upsertFile(normalized, 'vite.config.ts', `import { defineConfig } from 'vite';\nimport solid from 'vite-plugin-solid';\n\nexport default defineConfig({\n  plugins: [solid({ hot: false })],\n});\n`);
      upsertFile(normalized, 'tsconfig.json', `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "useDefineForClassFields": true,\n    "module": "ESNext",\n    "skipLibCheck": true,\n    "moduleResolution": "bundler",\n    "allowImportingTsExtensions": true,\n    "isolatedModules": true,\n    "moduleDetection": "force",\n    "noEmit": true,\n    "strict": false,\n    "noUnusedLocals": false,\n    "noUnusedParameters": false,\n    "jsx": "preserve",\n    "jsxImportSource": "solid-js"\n  },\n  "include": ["src"]\n}\n`);
      upsertFile(normalized, 'index.html', `<!doctype html>\n<html lang=\"it\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/index.tsx\"></script>\n  </body>\n</html>\n`);
      ensureFile('src/index.tsx', `import { render } from 'solid-js/web';\nimport App from './App';\n\nrender(() => <App />, document.getElementById('root')!);\n`);
      ensureFile('src/App.tsx', `export default function App() {\n  return (\n    <main style={{ padding: '24px', 'font-family': 'system-ui, sans-serif' }}>\n      <h1>Benvenuto su ${projectName}</h1>\n    </main>\n  );\n}\n`);
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

    if ((hasTailwindSignals || technology === 'nextjs') && technology !== 'nuxt') {
      // Nuxt uses @nuxtjs/tailwindcss module instead (configured above)
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

  if (technology === 'flask') {
    ensureTextContains('requirements.txt', ['flask>=3.0.0']);
    ensureFile('app.py', `from flask import Flask, render_template\n\napp = Flask(__name__)\n\n@app.get('/')\ndef home():\n    return render_template('index.html')\n\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=3000, debug=True)\n`);
    ensureFile('templates/index.html', `<!doctype html>\n<html lang=\"it\"><head><meta charset=\"utf-8\"><title>${projectName}</title></head>\n<body style=\"font-family: system-ui, sans-serif; padding: 24px;\"><h1>Benvenuto su ${projectName}</h1></body></html>\n`);
  }

  if (technology === 'fastapi') {
    ensureTextContains('requirements.txt', ['fastapi>=0.111.0', 'uvicorn>=0.30.0']);
    ensureFile('main.py', `from fastapi import FastAPI\nfrom fastapi.responses import HTMLResponse\n\napp = FastAPI()\n\n@app.get('/', response_class=HTMLResponse)\ndef home():\n    return \"\"\"<!doctype html><html lang='it'><body style='font-family:system-ui,sans-serif;padding:24px;'><h1>Benvenuto su ${projectName}</h1></body></html>\"\"\"\n`);
  }

  if (technology === 'django') {
    const fallbackModule = sanitizePythonModuleName(projectName);

    // Detect the AI's settings module: find directories containing settings.py
    const shadowNames = new Set(['django', 'flask', 'fastapi', 'uvicorn', 'gunicorn', 'celery', 'redis']);
    let aiModule: string | null = null;
    for (const f of normalized) {
      const match = f.path.match(/^([^/]+)\/settings\.py$/);
      if (match) { aiModule = match[1]; break; }
    }

    // If AI used a shadow name (e.g. "django/settings.py"), rename to fallbackModule
    let didRename = false;
    if (aiModule && shadowNames.has(aiModule)) {
      const oldPrefix = `${aiModule}/`;
      const newPrefix = `${fallbackModule}/`;
      for (const file of normalized) {
        if (file.path.startsWith(oldPrefix)) {
          file.path = newPrefix + file.path.slice(oldPrefix.length);
        }
        file.content = file.content.replace(
          new RegExp(`(['"])${aiModule}\\.`, 'g'),
          `$1${fallbackModule}.`
        );
      }
      aiModule = fallbackModule;
      didRename = true;
    }

    // Use whichever module the AI chose (or fallbackModule if none / renamed)
    const moduleName = aiModule || fallbackModule;

    ensureTextContains('requirements.txt', ['Django>=5.0,<6.0']);

    // Only overwrite manage.py if a shadow rename happened or manage.py doesn't exist
    if (didRename || !hasFile('manage.py')) {
      upsertFile(normalized, 'manage.py', `#!/usr/bin/env python\nimport os\nimport sys\n\nif __name__ == '__main__':\n    os.environ.setdefault('DJANGO_SETTINGS_MODULE', '${moduleName}.settings')\n    from django.core.management import execute_from_command_line\n    execute_from_command_line(sys.argv)\n`);
    }

    // Ensure ALLOWED_HOSTS = ['*'] in AI-generated settings (otherwise Django rejects requests)
    const settingsFile = normalized.find(f => f.path === `${moduleName}/settings.py`);
    if (settingsFile && !settingsFile.content.includes("'*'") && !settingsFile.content.includes('"*"')) {
      settingsFile.content = settingsFile.content.replace(
        /ALLOWED_HOSTS\s*=\s*\[.*?\]/,
        "ALLOWED_HOSTS = ['*']"
      );
    }

    // Fallback files only if AI didn't generate them
    ensureFile(`${moduleName}/__init__.py`, ``);
    ensureFile(`${moduleName}/settings.py`, `from pathlib import Path\n\nBASE_DIR = Path(__file__).resolve().parent.parent\nSECRET_KEY = 'dev-secret-key'\nDEBUG = True\nALLOWED_HOSTS = ['*']\nROOT_URLCONF = '${moduleName}.urls'\nMIDDLEWARE = []\nINSTALLED_APPS = []\nTEMPLATES = [{\n  'BACKEND': 'django.template.backends.django.DjangoTemplates',\n  'DIRS': [BASE_DIR / 'templates'],\n  'APP_DIRS': True,\n  'OPTIONS': {},\n}]\nWSGI_APPLICATION = '${moduleName}.wsgi.application'\nDATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': BASE_DIR / 'db.sqlite3'}}\nSTATIC_URL = '/static/'\n`);
    ensureFile(`${moduleName}/urls.py`, `from django.urls import path\nfrom django.http import HttpResponse\n\ndef home(_request):\n    return HttpResponse('<!doctype html><html lang=\"it\"><body style=\"font-family:system-ui,sans-serif;padding:24px;\"><h1>Benvenuto su ${projectName}</h1></body></html>')\n\nurlpatterns = [path('', home)]\n`);
    ensureFile(`${moduleName}/wsgi.py`, `import os\nfrom django.core.wsgi import get_wsgi_application\n\nos.environ.setdefault('DJANGO_SETTINGS_MODULE', '${moduleName}.settings')\napplication = get_wsgi_application()\n`);
  }

  if (technology === 'flutter') {
    ensureFile('pubspec.yaml', `name: ${sanitizePackageName(projectName).replace(/-/g, '_')}\ndescription: ${projectName}\npublish_to: 'none'\nversion: 1.0.0+1\nenvironment:\n  sdk: \">=3.3.0 <4.0.0\"\ndependencies:\n  flutter:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n`);
    ensureFile('lib/main.dart', `import 'package:flutter/material.dart';\n\nvoid main() {\n  runApp(const MyApp());\n}\n\nclass MyApp extends StatelessWidget {\n  const MyApp({super.key});\n\n  @override\n  Widget build(BuildContext context) {\n    return const MaterialApp(\n      home: Scaffold(\n        body: Center(\n          child: Text('Benvenuto su ${projectName}'),\n        ),\n      ),\n    );\n  }\n}\n`);
    upsertFile(normalized, 'web/index.html', `<!DOCTYPE html>\n<html>\n<head>\n  <base href=\"$FLUTTER_BASE_HREF\">\n  <meta charset=\"UTF-8\">\n  <meta content=\"IE=Edge\" http-equiv=\"X-UA-Compatible\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>${projectName}</title>\n  <link rel=\"manifest\" href=\"manifest.json\">\n</head>\n<body>\n  <script src=\"flutter_bootstrap.js\" async></script>\n</body>\n</html>\n`);
  }

  if (technology === 'laravel') {
    // Strip @vite directives from Blade templates — Vite doesn't work in our container
    for (const file of normalized) {
      if (file.path.endsWith('.blade.php')) {
        file.content = file.content.replace(/@vite\s*\([^)]*\)/g, '');
      }
    }
    // Remove Vite config files — no Node.js build step in container
    const viteFiles = ['vite.config.js', 'vite.config.ts', 'package.json', 'package-lock.json', 'webpack.mix.js'];
    for (const vf of viteFiles) {
      const idx = normalized.findIndex(f => f.path === vf);
      if (idx >= 0) normalized.splice(idx, 1);
    }

    ensureFile('composer.json', `{\n  \"name\": \"drape/${sanitizePackageName(projectName)}\",\n  \"type\": \"project\",\n  \"require\": {\n    \"php\": \">=8.1\"\n  }\n}\n`);
    ensureFile('artisan', `<?php\n$argv = $_SERVER['argv'] ?? [];\n$cmd = $argv[1] ?? '';\nif ($cmd === 'serve') {\n  $host = '0.0.0.0';\n  $port = '3000';\n  for ($i = 2; $i < count($argv); $i++) {\n    if (str_starts_with($argv[$i], '--host=')) $host = substr($argv[$i], 7);\n    if (str_starts_with($argv[$i], '--port=')) $port = substr($argv[$i], 7);\n    if ($argv[$i] === '--host' && isset($argv[$i + 1])) $host = $argv[$i + 1];\n    if ($argv[$i] === '--port' && isset($argv[$i + 1])) $port = $argv[$i + 1];\n  }\n  passthru('php -S ' . $host . ':' . $port . ' -t public', $exitCode);\n  exit($exitCode);\n}\necho \"Laravel guardrail stub ready\\n\";\n`);
    // Laravel requires .env with APP_KEY — without it, Finder.php fails with empty directory path
    ensureFile('.env', `APP_NAME=${projectName}\nAPP_ENV=local\nAPP_KEY=base64:dGhpc2lzYWR1bW15a2V5Zm9yZGV2ZWxvcG1lbnQx\nAPP_DEBUG=true\nAPP_URL=http://localhost:3000\n\nLOG_CHANNEL=stack\nLOG_LEVEL=debug\n\nDB_CONNECTION=sqlite\n`);
    ensureFile('bootstrap/cache/.gitkeep', ``);
    // bootstrap/app.php creates the Laravel application instance — required by public/index.php
    ensureFile('bootstrap/app.php', `<?php\n$app = new Illuminate\\Foundation\\Application(\n    $_ENV['APP_BASE_PATH'] ?? dirname(__DIR__)\n);\n$app->singleton(Illuminate\\Contracts\\Http\\Kernel::class, Illuminate\\Foundation\\Http\\Kernel::class);\n$app->singleton(Illuminate\\Contracts\\Console\\Kernel::class, Illuminate\\Foundation\\Console\\Kernel::class);\n$app->singleton(Illuminate\\Contracts\\Debug\\ExceptionHandler::class, Illuminate\\Foundation\\Exceptions\\Handler::class);\nreturn $app;\n`);
    // RouteServiceProvider loads routes/web.php — referenced in config/app.php providers
    ensureFile('app/Providers/RouteServiceProvider.php', `<?php\nnamespace App\\Providers;\n\nuse Illuminate\\Support\\Facades\\Route;\nuse Illuminate\\Foundation\\Support\\Providers\\RouteServiceProvider as ServiceProvider;\n\nclass RouteServiceProvider extends ServiceProvider\n{\n    public function boot(): void\n    {\n        $this->routes(function () {\n            Route::middleware('web')->group(base_path('routes/web.php'));\n        });\n    }\n}\n`);
    // Essential Laravel config files — without these, artisan serve crashes with "The "" directory does not exist."
    ensureFile('config/app.php', `<?php\nreturn [\n    'name' => env('APP_NAME', 'Laravel'),\n    'env' => env('APP_ENV', 'local'),\n    'debug' => (bool) env('APP_DEBUG', true),\n    'url' => env('APP_URL', 'http://localhost'),\n    'key' => env('APP_KEY'),\n    'cipher' => 'AES-256-CBC',\n    'maintenance' => ['driver' => 'file'],\n    'providers' => \\Illuminate\\Support\\ServiceProvider::defaultProviders()->merge([\n        App\\Providers\\RouteServiceProvider::class,\n    ])->toArray(),\n    'aliases' => \\Illuminate\\Support\\Facades\\Facade::defaultAliases()->toArray(),\n];\n`);
    ensureFile('config/view.php', `<?php\nreturn [\n    'paths' => [resource_path('views')],\n    'compiled' => env('VIEW_COMPILED_PATH', realpath(storage_path('framework/views'))),\n];\n`);
    ensureFile('config/session.php', `<?php\nreturn [\n    'driver' => env('SESSION_DRIVER', 'file'),\n    'lifetime' => 120,\n    'expire_on_close' => false,\n    'encrypt' => false,\n    'files' => storage_path('framework/sessions'),\n    'connection' => null,\n    'table' => 'sessions',\n    'store' => null,\n    'lottery' => [2, 100],\n    'cookie' => 'laravel_session',\n    'path' => '/',\n    'domain' => null,\n    'secure' => false,\n    'http_only' => true,\n    'same_site' => 'lax',\n    'partitioned' => false,\n];\n`);
    ensureFile('config/database.php', `<?php\nreturn [\n    'default' => env('DB_CONNECTION', 'sqlite'),\n    'connections' => [\n        'sqlite' => ['driver' => 'sqlite', 'database' => env('DB_DATABASE', database_path('database.sqlite')), 'prefix' => ''],\n    ],\n    'migrations' => 'migrations',\n];\n`);
    ensureFile('config/logging.php', `<?php\nreturn [\n    'default' => env('LOG_CHANNEL', 'stack'),\n    'channels' => [\n        'stack' => ['driver' => 'stack', 'channels' => ['single']],\n        'single' => ['driver' => 'single', 'path' => storage_path('logs/laravel.log'), 'level' => 'debug'],\n    ],\n];\n`);
    ensureFile('config/filesystems.php', `<?php\nreturn [\n    'default' => 'local',\n    'disks' => ['local' => ['driver' => 'local', 'root' => storage_path('app')]],\n];\n`);
    ensureFile('config/cache.php', `<?php\nreturn [\n    'default' => env('CACHE_DRIVER', 'file'),\n    'stores' => [\n        'file' => ['driver' => 'file', 'path' => storage_path('framework/cache/data')],\n    ],\n];\n`);
    // public/index.php MUST be the Laravel bootstrap — NOT a static HTML page
    ensureFile('public/index.php', `<?php\nuse Illuminate\\Contracts\\Http\\Kernel;\nuse Illuminate\\Http\\Request;\n\ndefine('LARAVEL_START', microtime(true));\nrequire __DIR__.'/../vendor/autoload.php';\n$app = require_once __DIR__.'/../bootstrap/app.php';\n$kernel = $app->make(Kernel::class);\n$response = $kernel->handle($request = Request::capture());\n$response->send();\n$kernel->terminate($request, $response);\n`);
    ensureFile('routes/web.php', `<?php\nuse Illuminate\\Support\\Facades\\Route;\n\nRoute::get('/', function () {\n    return view('welcome');\n});\n`);
    ensureFile('resources/views/welcome.blade.php', `<!doctype html><html lang=\"it\"><head><meta charset=\"utf-8\"><title>${projectName}</title></head><body style=\"font-family:system-ui,sans-serif;padding:24px;\"><h1>Benvenuto su ${projectName}</h1></body></html>\n`);
  }

  // --- Post-normalization: remove duplicate config file variants ---
  const viteTech = new Set(['react', 'vue', 'svelte', 'solid', 'remix']);
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
  const nodeTechSet = new Set(['nextjs', 'react', 'vue', 'nuxt', 'svelte', 'angular', 'astro', 'remix', 'solid', 'expo']);
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
          'virtual:remix/server-build', '~icons', 'virtual:', '$app', '$env',
          '#app', '#imports', '#components', '#build',
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
    const report = JSON.parse(result.data.content);
    res.json({ success: true, report });
  } catch {
    res.json({ success: true, report: null });
  }
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
      const envContent = [
        `DATABASE_URL=${neonCredentials.connectionUri}`,
        `DATABASE_URL_POOLED=${neonCredentials.connectionUriPooled}`,
        `PGHOST=${neonCredentials.host}`,
        `PGDATABASE=${neonCredentials.database}`,
        `PGUSER=${neonCredentials.role}`,
        `PGPASSWORD=${neonCredentials.password}`,
        `BETTER_AUTH_SECRET=${authSecret}`,
        `NEXT_PUBLIC_APP_URL=http://localhost:3000`,
      ].join('\n');
      await fileService.writeFile(projectId, '.env.local', envContent);
      report.completeAction(envActionId);

      // Run auth schema to create user/session/account tables
      const authSchemaActionId = report.startAction('database', 'Creating auth tables', 'Tables: user, session, account, verification');
      try {
        const authSchemaPath = path.resolve(__dirname, '../../templates/nextjs-cloud/db/auth-schema.sql');
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
    nuxt: 'Nuxt 3 with Vue 3, TypeScript, and Tailwind CSS',
    svelte: 'SvelteKit with Vite, TypeScript, and Tailwind CSS',
    angular: 'Angular 18 with TypeScript and Tailwind CSS',
    astro: 'Astro with TypeScript and Tailwind CSS',
    remix: 'Remix with React, Vite, TypeScript, and Tailwind CSS',
    solid: 'Solid.js with Vite, TypeScript, and Tailwind CSS',
    flask: 'Python Flask with Jinja2 templates, HTML, CSS',
    django: 'Python Django with templates, HTML, CSS, and Tailwind CSS',
    fastapi: 'Python FastAPI with Jinja2 templates, HTML, CSS',
    expo: 'React Native with Expo, TypeScript, and React Navigation',
    flutter: 'Flutter Web with Dart and Material Design',
    laravel: 'Laravel with PHP, Blade templates, and Tailwind CSS',
    'HTML/CSS/JS': 'HTML5, CSS3, and vanilla JavaScript',
    'python-console': 'Python 3 console application (no web server, no framework)',
    'javascript-console': 'Node.js console application (no web server, no Express)',
    'c-lang': 'C console application compiled with gcc',
    'cpp': 'C++ console application compiled with g++',
    'java': 'Java console application',
  };
  const techDesc = techMap[technology] || techMap['nextjs'];

  update(15, 'Designing architecture...', 'AI Generating');

  // Build the list of config files the AI should NOT generate (they are auto-created by the template system)
  const excludedConfigFiles: Record<string, string[]> = {
    react: ['vite.config.ts', 'vite.config.js', 'tsconfig.json', 'postcss.config.js', 'postcss.config.mjs', 'tailwind.config.js', 'tailwind.config.ts', 'index.html'],
    vue: ['vite.config.ts', 'vite.config.js', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts', 'index.html'],
    svelte: ['vite.config.ts', 'vite.config.js', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts', 'index.html'],
    solid: ['vite.config.ts', 'vite.config.js', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts', 'index.html'],
    remix: ['vite.config.ts', 'vite.config.js', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts'],
    angular: ['angular.json', 'tsconfig.json', 'tsconfig.app.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts'],
    astro: ['astro.config.mjs', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts'],
    nuxt: ['nuxt.config.ts', 'tsconfig.json', 'postcss.config.js', 'tailwind.config.js', 'tailwind.config.ts'],
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
- For framework projects (Next.js, React, Vue, Nuxt, Svelte, Angular, Astro, Remix, Solid.js): include package.json with project name "${projectName}" and all necessary dependencies
- Include a working main page with a professional, modern UI
- CRITICAL: Design mobile-first. The preview runs on a phone screen (390px wide). All layouts MUST look perfect on mobile first. Use responsive utilities (Tailwind: default styles for mobile, sm:/md:/lg: for larger screens. CSS: use min-width media queries). Never use fixed widths larger than 100%. Ensure tap targets are at least 44px. No horizontal scrolling. Use flexbox/grid with wrap. For Tailwind projects, start with mobile styles and enhance with breakpoint prefixes.
- Use Italian language for user-facing text where appropriate
- For Next.js: use App Router (app/ directory), include layout.tsx and page.tsx
- For Nuxt: use pages/ directory, include app.vue
- For SvelteKit: use src/ directory, include App.svelte and main.ts
- For Angular: use standalone components, src/ directory
- For Astro: use src/pages/ directory, include index.astro
- For Remix: use app/routes/ directory, include root.tsx and _index.tsx
- For Solid.js: use src/ directory, include App.tsx and index.tsx
- For Flask: include app.py (with app = Flask(__name__) and app.run(host='0.0.0.0', port=3000, debug=True) in __main__), requirements.txt, templates/ directory with base.html, static/ directory. The server MUST listen on port 3000.
- For Django: include manage.py, requirements.txt, project settings directory, templates/ directory, a main app with views.py and urls.py
- For FastAPI: include main.py, requirements.txt (with fastapi and uvicorn), templates/ directory with index.html, static/ directory
- For React Native (Expo): include package.json with "main": "expo/AppEntry" and dependencies: expo, react, react-dom, react-native, react-native-web, @expo/metro-runtime. Include App.tsx with a main screen using StyleSheet, backgroundColor '#fff'. Must support web platform (expo start --web)
- For Flutter: include pubspec.yaml (with flutter sdk), lib/main.dart with MaterialApp, web/index.html
- For Laravel: include composer.json, artisan, routes/web.php, resources/views/ with Blade templates, app/ directory structure. Do NOT use Vite or Laravel Mix for asset bundling — use plain inline CSS and JS in Blade templates instead. The welcome.blade.php MUST contain the actual project content (not the default Laravel welcome page). Include a .env file with APP_KEY=base64:dGhpc2lzYWR1bW15a2V5Zm9yZGV2ZWxvcG1lbnQx and APP_DEBUG=true
- For HTML: include index.html, style.css, script.js
- For Python console: include main.py with a working example program that prints output to stdout. Include requirements.txt ONLY if external packages are needed. Do NOT include any web server, Flask, Django, or FastAPI. The program should demonstrate interesting logic (not just "Hello World").
- For JavaScript console: include index.js with a working example program that uses console.log for output. Include package.json ONLY if external packages are needed. Do NOT include Express, http server, or any web framework.
- For C: include main.c with a working example program and a Makefile with target "main". Use standard C (C11). Include interesting logic, not just printf("Hello").
- For C++: include main.cpp with a working example program and a Makefile with target "main". Use standard C++ (C++17). Include interesting logic.
- For Java: include Main.java with class Main and public static void main(String[] args). Do NOT use packages or subdirectories. Include interesting logic.
- Make it immediately runnable with the dev server
- Do NOT include node_modules, lock files, vendor/, or .dart_tool/
- Keep it concise but functional${excludedNote}

CRITICAL RULES to avoid build errors:
- Do NOT use require() — use ES module import/export syntax only
- Do NOT import packages that are not in your package.json dependencies
- Do NOT use complex TypeScript generics, "as" type casts, or advanced type annotations — keep types simple
- Do NOT add "type": "module" to package.json (except for Svelte/SvelteKit which requires it)
- Every import must reference a file you generated or a package listed in dependencies
- Do NOT generate empty files
- Use "export default function" for components
- For React/Next.js/Remix/Solid: always use JSX syntax in .tsx files
- For Vue: use <script setup lang="ts"> syntax
- For Svelte: use <script lang="ts"> with standard Svelte 4 syntax. This is plain Svelte (NOT SvelteKit) — put ALL content in src/App.svelte. Do NOT use SvelteKit routing patterns (no +page.svelte, no +layout.svelte, no routes/ directory)
- For Flask: the Flask app variable MUST be named "app" (e.g., app = Flask(__name__)). Include app.run(host='0.0.0.0', port=3000, debug=True) in if __name__ == '__main__' block. NEVER use port 5000. In Jinja2 templates, always use parentheses for method calls: dict.items() not dict.items, list.sort() not list.sort. Pass only simple data (lists, dicts, strings) to templates — never pass functions or methods.
- For Django: NEVER name the project settings directory "django" — this shadows the Django package and causes ImportError. Use a descriptive name derived from the project (e.g., "myproject", "pizzeria", "config"). The DJANGO_SETTINGS_MODULE must match this directory name (e.g., "pizzeria.settings"). Also NEVER use "flask", "fastapi", or any Python package name as a directory name.
- For Laravel: Do NOT use Vite, Laravel Mix, or any Node.js build tools. Use plain CSS and JS directly in Blade templates. Do NOT include vite.config.js, package.json, or webpack.mix.js. Use @vite directives is FORBIDDEN — use <style> and <script> tags directly.
- For Angular: use standalone components with inline templates
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
    'nuxt.config.ts', 'svelte.config.js', 'angular.json', 'tsconfig.app.json',
    'astro.config.mjs', 'app.config.ts', 'composer.json',
    'app.json', 'pubspec.yaml', 'analysis_options.yaml',
    'index.html', // Vite entry point
    'manage.py', 'artisan', 'public/index.php', 'bootstrap/app.php',
    // Cloud auth plumbing — NEVER overwrite
    'lib/db.ts', 'lib/auth.ts', 'lib/auth-client.ts',
    'app/api/auth/[...all]/route.ts',
    'app/components/auth-provider.tsx',
    'middleware.ts', 'db/auth-schema.sql',
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
  // Pro for initial generation (high quality), Flash for fallback/fix
  const models = ['gemini-3.1-pro', 'gemini-3-flash', 'gemini-3-flash'];
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
            // Add missing 'use client' for files with hooks
            if ((file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) &&
                /\b(useState|useEffect|useCallback|useMemo|useRef|useReducer)\b/.test(content) &&
                !content.startsWith("'use client'") && !content.startsWith('"use client"')) {
              content = "'use client';\n\n" + content;
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
        'nuxt.config.ts', 'svelte.config.js', 'angular.json', 'tsconfig.app.json',
        'astro.config.mjs', 'app.config.ts', 'composer.json',
        'app.json', 'pubspec.yaml', 'analysis_options.yaml',
        'index.html',
        'manage.py', 'artisan', 'public/index.php', 'bootstrap/app.php',
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
          if (aiGenerated.dependencies) existing.dependencies = { ...existing.dependencies, ...aiGenerated.dependencies };
          if (aiGenerated.devDependencies) existing.devDependencies = { ...existing.devDependencies, ...aiGenerated.devDependencies };
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
      if ((file.path.endsWith('.tsx') || file.path.endsWith('.jsx')) &&
          /\b(useState|useEffect|useCallback|useMemo|useRef|useReducer)\b/.test(content) &&
          !content.startsWith("'use client'") && !content.startsWith('"use client"')) {
        content = "'use client';\n\n" + content;
      }
      await fileService.writeFile(projectId, file.path, content);
      writtenFiles.push(file.path);
    }

    log.info(`[CreateProject] Total files: ${writtenFiles.length} (${streamWrittenFiles.length} streamed + ${remainingFiles.length} post-stream)`);

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
        await workspaceService.warmProject(projectId, userId);
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

    // === BUILD CHECK + AUTO-FIX LOOP (max 5 attempts) ===
    const MAX_FIX_ATTEMPTS = 5;
    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) {
      try {
        // Wait for dev server to compile
        await new Promise(r => setTimeout(r, attempt === 0 ? 4000 : 3000));
        const checkPct = 90 + attempt;
        update(checkPct, attempt > 0 ? `Fixing errors (attempt ${attempt + 1})...` : 'Checking build...', 'Build Check');

        // Read dev server logs for errors
        const logsResult = await workspaceService.exec(projectId, userId, 'cat /home/coder/server.log 2>/dev/null | tail -80');
        const serverLog = logsResult.stdout || '';

        // Curl the dev server to trigger compilation AND capture the body for blank page detection
        const curlResult = await workspaceService.exec(projectId, userId, 'curl -s -w "\\n%{http_code}" http://localhost:3000 2>/dev/null || echo "\\n000"');
        const curlLines = (curlResult.stdout || '').split('\n');
        const httpCode = curlLines[curlLines.length - 1]?.trim() || '000';
        const htmlBody = curlLines.slice(0, -1).join('\n');

        // If server isn't running at all, try to restart it
        if (httpCode === '000' && attempt < MAX_FIX_ATTEMPTS - 1) {
          log.warn(`[BuildCheck] Server not responding (HTTP 000) on attempt ${attempt + 1}, restarting...`);
          update(checkPct, 'Server not responding, restarting...', 'Restarting');
          try {
            // Check if it's a dep install issue by reading server.log
            const crashLog = await workspaceService.exec(projectId, userId, 'cat /home/coder/server.log 2>/dev/null | tail -20');
            const crashText = crashLog.stdout || '';
            if (crashText.includes('Cannot find module') || crashText.includes('MODULE_NOT_FOUND')) {
              // Missing module — try reinstalling deps
              await workspaceService.exec(projectId, userId, 'cd /home/coder/project && bun install --no-save 2>/dev/null || npm install --legacy-peer-deps 2>/dev/null');
            }
            // Restart dev server by killing and re-running
            await workspaceService.exec(projectId, userId, 'pkill -f "next dev\\|vite\\|nuxt\\|svelte-kit\\|remix\\|astro\\|ng serve" 2>/dev/null; sleep 2');
            // Re-warm will recreate the dev server
            try { await workspaceService.warmProject(projectId, userId); } catch {}
          } catch (restartErr: any) {
            log.warn(`[BuildCheck] Restart failed: ${restartErr.message}`);
          }
          continue;
        }

        // Check for blank/error page in HTML body
        const isBlankPage = htmlBody.length < 200 || (!htmlBody.includes('<div') && !htmlBody.includes('<main') && !htmlBody.includes('<section'));
        const hasClientError = htmlBody.includes('Application error') || htmlBody.includes('Internal Server Error') || htmlBody.includes('Module not found');

        // Take a screenshot with Puppeteer for VISUAL verification (every check, not just retries)
        let screenshotBase64 = '';
        let isVisuallyBlank = false;
        if (httpCode === '200') {
          try {
            const ssResult = await workspaceService.exec(projectId, userId, 'timeout 25 node /usr/local/bin/screenshot.js 2>/tmp/ss-err.txt');
            screenshotBase64 = (ssResult.stdout || '').trim();
            // If screenshot is very small (< 5KB base64 ≈ ~3KB image), page is likely blank/white
            if (screenshotBase64 && screenshotBase64.length < 7000) {
              isVisuallyBlank = true;
              log.info(`[BuildCheck] Screenshot too small (${screenshotBase64.length} chars) — likely blank page`);
            }
          } catch { /* Puppeteer not available — continue without */ }
        }

        // Re-read logs after curl (compilation may have happened)
        const logsResult2 = await workspaceService.exec(projectId, userId, 'cat /home/coder/server.log 2>/dev/null | tail -80');
        const fullLog = (serverLog + '\n' + (logsResult2.stdout || '')).trim();

        // Extract errors
        const errorPatterns = [
          /(?:Error|ERROR):\s*(.*(?:Cannot find module|Module not found|is not defined|Unexpected token|SyntaxError|TypeError|ReferenceError|Cannot resolve|Failed to resolve)[^\n]*)/gi,
          /error\s+TS\d+:\s*([^\n]*)/gi,
          /(?:ENOENT):\s*([^\n]*no such file[^\n]*)/gi,
          /Unexpected token[^\n]*/gi,
          /Invalid src prop[^\n]*/gi,
        ];

        const buildErrors: string[] = [];
        for (const pattern of errorPatterns) {
          let m;
          while ((m = pattern.exec(fullLog)) !== null) {
            const err = (m[1] || m[0]).trim();
            if (!buildErrors.some(e => e.includes(err.substring(0, 40))) && buildErrors.length < 8) {
              buildErrors.push(err);
            }
          }
        }

        // Collect Puppeteer JS errors (captured during screenshot)
        if (screenshotBase64) {
          try {
            const ssErr = await workspaceService.exec(projectId, userId, 'cat /tmp/ss-err.txt 2>/dev/null');
            if (ssErr.stdout?.includes('"errors"')) {
              const pageErrors = JSON.parse(ssErr.stdout).errors || [];
              for (const e of pageErrors.slice(0, 3)) {
                if (!buildErrors.some(be => be.includes(e.substring(0, 30)))) buildErrors.push(e);
              }
            }
          } catch {}
        }

        if (buildErrors.length === 0 && httpCode !== '000' && httpCode !== '500' && !isBlankPage && !hasClientError && !isVisuallyBlank) {
          // Run E2E check on the last attempt to verify pages work
          try {
            const e2eResult = await workspaceService.exec(projectId, userId, 'timeout 30 node /usr/local/bin/e2e-check.js 2>/dev/null');
            const e2e = JSON.parse(e2eResult.stdout || '{}');
            if (e2e.passed === false && e2e.errors?.length > 0) {
              log.info(`[BuildCheck] E2E found ${e2e.errors.length} issues — will fix`);
              for (const err of e2e.errors.slice(0, 3)) buildErrors.push(err);
            } else {
              log.info(`[BuildCheck] Build + E2E OK on attempt ${attempt + 1}`);
              break; // All clean!
            }
          } catch {
            log.info(`[BuildCheck] Build OK (HTTP ${httpCode}, E2E skipped) on attempt ${attempt + 1}`);
            break; // E2E not available, build is good enough
          }
        }

        // Add blank page / client error to build errors for AI context
        if (isBlankPage && buildErrors.length === 0) buildErrors.push('Page is blank — HTML body has no content divs. Check that components render properly and use "use client" where needed.');
        if (hasClientError && buildErrors.length === 0) buildErrors.push('Page shows "Application error: a client-side exception has occurred". Check hydration, window access, and component imports.');
        if (isVisuallyBlank && buildErrors.length === 0) buildErrors.push('Page renders as a WHITE/BLANK screen (verified with Puppeteer screenshot). The HTML might have tags but nothing visible renders. Check: CSS imports in layout.tsx, globals.css exists, Tailwind is configured, components actually render content.');

        if (buildErrors.length === 0 && attempt > 0) {
          log.info(`[BuildCheck] No more errors detected on attempt ${attempt + 1}`);
          break;
        }

        if (buildErrors.length === 0) continue; // No errors found yet, maybe server is still starting

        log.info(`[BuildCheck] Attempt ${attempt + 1}: ${buildErrors.length} errors found`);
        update(checkPct + 1, `Fixing ${buildErrors.length} error${buildErrors.length > 1 ? 's' : ''}...`, 'Auto-Fix');

        // Read the broken files for AI context
        const brokenFiles: { path: string; content: string }[] = [];
        for (const err of buildErrors) {
          // Extract file path from error
          const fileMatch = err.match(/(?:\/home\/coder\/project\/|\.\/)?([a-zA-Z0-9_\-/.]+\.(?:tsx?|jsx?|vue|svelte|astro))/);
          if (fileMatch) {
            const relPath = fileMatch[1].replace(/^\/home\/coder\/project\//, '');
            try {
              const readResult = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${relPath} 2>/dev/null`);
              if (readResult.stdout) {
                brokenFiles.push({ path: relPath, content: readResult.stdout });
              }
            } catch { /* ignore */ }
          }
        }

        // For visual blank pages, also read layout + css files for context
        if (isVisuallyBlank || isBlankPage) {
          for (const layoutPath of ['app/layout.tsx', 'app/globals.css', 'src/App.tsx', 'src/index.css', 'src/main.tsx']) {
            try {
              const lr = await workspaceService.exec(projectId, userId, `cat /home/coder/project/${layoutPath} 2>/dev/null`);
              if (lr.stdout && !brokenFiles.some(f => f.path === layoutPath)) {
                brokenFiles.push({ path: layoutPath, content: lr.stdout });
              }
            } catch {}
          }
        }

        const fileContext = brokenFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');
        const screenshotNote = screenshotBase64 ? '\n\nA Puppeteer screenshot was taken and the page appears BLANK/WHITE. The page must render visible content.' : '';

        const fixPrompt = `Fix these ${technology} errors:\n\n${buildErrors.join('\n')}${screenshotNote}\n\n${fileContext ? `Current file contents:\n${fileContext}\n\n` : ''}Return JSON array of fixed files: [{"path": "file/path", "content": "complete fixed content"}]\nRules:\n- Return the COMPLETE file content, not just the changed lines\n- For blank/white page: check layout.tsx imports globals.css, check globals.css has @import "tailwindcss", check components actually return visible JSX\n- For 'use client' errors: add 'use client' at the very top of the file\n- For missing import/module errors: add the correct import statement\n- For 'is not defined' errors: add the import for the missing symbol\n- For next/image Invalid src: replace <Image> with <img> and remove the next/image import\n- NEVER import from lucide-react, @heroicons, @fortawesome — use react-icons instead\n- Return valid JSON only`;

        try {
          const fixStream = aiProviderService.chatStream('gemini-3-flash',
            [{ role: 'user', content: fixPrompt }],
            undefined, 'Fix build errors. Return only valid JSON.', { temperature: 0.1, maxTokens: 30000 }
          );
          let fixText = '';
          for await (const chunk of fixStream) { fixText += chunk; }

          const fixMatch = fixText.match(/\[[\s\S]*?\]/);
          if (fixMatch) {
            const fixes: { path: string; content: string }[] = JSON.parse(fixMatch[0]);
            let fixCount = 0;
            for (const fix of fixes) {
              if (fix.path && fix.content && fix.content.trim().length > 0) {
                await fileService.writeFile(projectId, fix.path, fix.content);
                log.info(`[BuildCheck] Fixed: ${fix.path}`);
                fixCount++;
              }
            }
            log.info(`[BuildCheck] Applied ${fixCount} fixes on attempt ${attempt + 1}`);
          }
        } catch (fixErr: any) {
          log.warn(`[BuildCheck] AI fix failed on attempt ${attempt + 1}: ${fixErr.message}`);
          break; // Don't retry if AI fails
        }

      } catch (checkErr: any) {
        log.warn(`[BuildCheck] Check failed on attempt ${attempt + 1}: ${checkErr.message}`);
        break;
      }
    }

    // Complete
    report.complete();
    update(100, 'Project Created Successfully!', 'Complete');
    task.status = 'completed';
    task.result = {
      projectId,
      projectName,
      technology,
      templateDescription: description,
      files: writtenFiles,
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
