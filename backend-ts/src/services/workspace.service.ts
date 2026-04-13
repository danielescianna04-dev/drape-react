import { log } from '../utils/logger';
import { Session, ProjectInfo, Result, PreviewResult, ExecResult, ProgressCallback } from '../types';
import { dockerService } from './docker.service';
import { sessionService } from './session.service';
import { fileService } from './file.service';
import { fileWatcherService } from './file-watcher.service';
import { projectDetectorService } from './project-detector.service';
import { dependencyService } from './dependency.service';
import { devServerService } from './dev-server.service';
import { containerLifecycleService } from './container-lifecycle.service';
import { logWatcherService } from './log-watcher.service';
import { appendRuntimeAction } from './build-report.service';
import { caseSensitivityService } from './case-sensitivity.service';
import { execShell, shellEscape } from '../utils/helpers';
import { config } from '../config';
import path from 'path';

const HEALTH_CHECK_TTL = 30_000; // 30 seconds

class WorkspaceService {
  private shouldSkipInstall(projectInfo: ProjectInfo): boolean {
    return projectInfo.type === 'static'
      || projectInfo.type === 'unknown'
      || (projectInfo.hasWebUI === false && !projectInfo.installCommand);
  }

  private async copySupportScriptToContainer(
    projectId: string,
    scriptName: 'e2e-check.js' | 'qa-agent.js',
    targetPath: string,
  ): Promise<void> {
    try {
      const nodePath = await import('path');
      const nodeFs = await import('fs');
      const childProcess = await import('child_process');
      const scriptSrc = nodePath.join(__dirname, `../../scripts/${scriptName}`);
      const hostDrapeDir = nodePath.join(config.projectsRoot, projectId, '.drape');

      if (!nodeFs.existsSync(scriptSrc)) return;

      if (!nodeFs.existsSync(hostDrapeDir)) {
        nodeFs.mkdirSync(hostDrapeDir, { recursive: true });
      }

      const hostDst = nodePath.join(hostDrapeDir, scriptName);
      nodeFs.copyFileSync(scriptSrc, hostDst);

      const containerList = await dockerService.listContainers();
      const container = containerList.find((c: any) => c.projectId === projectId);
      if (container) {
        childProcess.execSync(`docker cp ${hostDst} ${container.id}:${targetPath}`);
      }

      const copiedSize = nodeFs.statSync(hostDst).size;
      log.info(`[Workspace] Copied ${scriptName} to container (${copiedSize} bytes)`);
    } catch (error: any) {
      log.warn(`[Workspace] Failed to copy ${scriptName}: ${error.message}`);
    }
  }

  private async copySupportScripts(projectId: string): Promise<void> {
    await this.copySupportScriptToContainer(projectId, 'e2e-check.js', '/usr/local/bin/e2e-check.js');
    await this.copySupportScriptToContainer(projectId, 'qa-agent.js', '/usr/local/bin/qa-agent.js');
  }

  private async prepareWebProjectFiles(projectId: string, projectInfo: ProjectInfo): Promise<void> {
    if (projectInfo.type !== 'nextjs' && projectInfo.type !== 'vite') return;

    await this.fixTailwindV4Css(projectId);
    if (projectInfo.type === 'nextjs') {
      await this.ensureCSSPipeline(projectId);
    }
  }

  private async ensureRuntimeDependencyInstalled(
    projectId: string,
    session: Session,
    projectInfo: ProjectInfo,
  ): Promise<void> {
    const runtimePkg = this.getRuntimeCheckPackage(projectInfo.type);
    if (!runtimePkg) return;

    try {
      const check = await dockerService.exec(
        session.agentUrl,
        `test -d node_modules/${runtimePkg} && test -f node_modules/${runtimePkg}/package.json && echo OK || echo MISSING`,
        '/home/coder/project',
        5000,
        true,
      );

      if ((check.stdout || '').trim() !== 'MISSING') return;

      log.warn(`[Workspace] ${runtimePkg} missing from node_modules after install — forcing clean reinstall for ${projectId}`);
      await dockerService.exec(
        session.agentUrl,
        'rm -rf node_modules bun.lock bun.lockb package-lock.json yarn.lock pnpm-lock.yaml',
        '/home/coder/project',
        30000,
        true,
      );

      try {
        await fileService.writeFile(projectId, '.package-json-hash', '');
      } catch {}

      await dependencyService.install(projectId, session, projectInfo);
    } catch (error: any) {
      log.warn(`[Workspace] Runtime sanity check failed for ${projectId}: ${error.message}`);
    }
  }

  /**
   * Get or create a container for a user+project.
   * This is the main entry point — all operations go through here.
   */
  async getOrCreateContainer(projectId: string, userId: string): Promise<Session> {
    return sessionService.withLock(projectId, userId, async () => {
      // Check existing session for this user+project
      const existing = await sessionService.get(projectId, userId);
      if (existing) {
        // Skip health check if recently verified (saves ~100-200ms per message)
        const now = Date.now();
        if (existing.lastHealthCheck && (now - existing.lastHealthCheck) < HEALTH_CHECK_TTL) {
          existing.lastUsed = now;
          await sessionService.set(projectId, userId, existing);
          return existing;
        }

        const healthy = await containerLifecycleService.isHealthy(existing.agentUrl);
        if (healthy) {
          existing.lastUsed = now;
          existing.lastHealthCheck = now;
          await sessionService.set(projectId, userId, existing);
          return existing;
        }
        // Container dead — clean up and recreate
        log.warn(`[Workspace] Container for ${userId}:${projectId} unhealthy, recreating`);
        await containerLifecycleService.destroy(projectId, userId).catch(() => {});
      }

      // Keep multiple active project containers per user up to a bounded limit.
      // Evict least recently used containers when the user exceeds the limit.
      const otherSessions = await sessionService.getByUserId(userId);
      const existingOtherSessions = otherSessions.filter(s => s.projectId !== projectId);
      const maxActive = Math.max(1, config.maxActiveContainersPerUser);
      if (existingOtherSessions.length >= maxActive) {
        const overflow = existingOtherSessions.length - maxActive + 1;
        const toEvict = [...existingOtherSessions]
          .sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0))
          .slice(0, overflow);

        for (const evict of toEvict) {
          log.info(`[Workspace] Evicting LRU container for ${userId}: ${evict.projectId}`);
          fileWatcherService.stopWatching(evict.projectId);
          logWatcherService.stop(evict.projectId);
          await devServerService.stop(evict).catch(() => {});
          await containerLifecycleService.destroy(evict.projectId, userId).catch(e =>
            log.warn(`[Workspace] Failed to evict ${evict.projectId}: ${e.message}`)
          );
        }
      }

      // Create new container — NVMe bind mount means files are immediately available
      const container = await containerLifecycleService.create(projectId);
      const session: Session = {
        containerId: container.id,
        projectId,
        userId,
        agentUrl: container.agentUrl,
        previewPort: container.previewPort,
        serverId: container.serverId,
        createdAt: container.createdAt,
        lastUsed: Date.now(),
      };

      await sessionService.set(projectId, userId, session);
      return session;
    });
  }

  /**
   * Warm up a project: create container + install deps + start dev server in background.
   * Called by /fly/clone. Returns quickly, work continues in background.
   */
  async warmProject(projectId: string, userId: string, repoUrl?: string, githubToken?: string, branch?: string): Promise<Result> {
    const session = await this.getOrCreateContainer(projectId, userId);

    // If repo URL provided and no files exist, clone
    if (repoUrl) {
      const hasFiles = await fileService.exists(projectId, 'package.json');
      if (!hasFiles) {
        await this.cloneRepository(projectId, repoUrl, githubToken, branch);
      }
    }

    // Fix macOS→Linux case-sensitivity mismatches in imports
    await caseSensitivityService.fix(projectId);

    // Detect project type
    const projectInfo = await projectDetectorService.detect(projectId);
    session.projectInfo = projectInfo;
    await sessionService.set(projectId, userId, session);

    // Console projects don't have a persistent server — skip isRunning check
    if (projectInfo.hasWebUI !== false) {
      // Check if dev server already running (fast path for re-warm)
      if (await devServerService.isRunning(session.agentUrl)) {
        log.info(`[Workspace] Dev server already running for ${projectId} — skip warming`);
        return { success: true };
      }
    }

    // Background: install + start dev server
    setImmediate(async () => {
      try {
        log.info(`[Workspace] Background warming ${projectId}...`);
        await this.copySupportScripts(projectId);
        await this.prepareWebProjectFiles(projectId, projectInfo);

        // Install dependencies (skip for console projects without deps and static/unknown)
        const skipInstall = this.shouldSkipInstall(projectInfo);
        if (!skipInstall) {
          await dependencyService.install(projectId, session, projectInfo);
          await this.ensureRuntimeDependencyInstalled(projectId, session, projectInfo);
        }

        // Start dev server (or run console program)
        await devServerService.start(session, projectInfo);
        session.preparedAt = Date.now();
        await sessionService.set(projectId, userId, session);

        // Begin tailing the container's server.log for runtime errors.
        // Errors will be appended to .drape/build-report.json and surfaced
        // in the project history UI.
        logWatcherService.start(projectId, session.agentUrl);

        log.info(`[Workspace] Warming complete for ${projectId}`);
      } catch (e: any) {
        log.error(`[Workspace] Background warming failed for ${projectId}: ${e.message}`);
        await appendRuntimeAction(projectId, 'warming', 'Warming failed', {
          status: 'failed',
          error: (e.message || 'unknown').substring(0, 500),
        }).catch(() => {});
      }
    });

    // Start file watcher
    fileWatcherService.startWatching(projectId).catch(() => {});

    return { success: true };
  }

  /**
   * Returns the package name to verify in node_modules as a sanity check
   * after install. If this package is missing, install is considered broken.
   */
  private getRuntimeCheckPackage(type: string | undefined): string | null {
    switch (type) {
      case 'nextjs': return 'next';
      case 'vite': return 'vite';
      case 'svelte': return 'svelte';
      case 'nuxt': return 'nuxt';
      case 'astro': return 'astro';
      case 'remix': return '@remix-run/react';
      case 'solid': return 'solid-js';
      case 'angular': return '@angular/core';
      case 'expo': return 'expo';
      default: return null;
    }
  }

  /**
   * Fix Tailwind CSS version mismatch between globals.css and installed package.
   * If v3 installed but v4 syntax in CSS → convert to v3.
   * If v4 installed but v3 syntax in CSS → convert to v4.
   */
  private async fixTailwindV4Css(projectId: string): Promise<void> {
    try {
      // Detect installed Tailwind version
      const pkgResult = await fileService.readFile(projectId, 'node_modules/tailwindcss/package.json');
      const pkgContent = pkgResult.success ? pkgResult.data?.content : null;
      if (!pkgContent) return;
      const twVersion = parseInt(JSON.parse(pkgContent).version || '3');

      // Try Next.js path first, fall back to Vite/React path
      const candidatePaths = ['app/globals.css', 'src/index.css', 'src/app.css', 'src/main.css'];
      let cssPath = '';
      let css: string | null = null;
      for (const p of candidatePaths) {
        const r = await fileService.readFile(projectId, p);
        if (r.success && r.data?.content) {
          cssPath = p;
          css = r.data.content;
          break;
        }
      }
      if (!css) return;

      const hasV4Syntax = css.includes('@import "tailwindcss"') || css.includes("@import 'tailwindcss'") || css.includes('@theme');
      const hasV3Syntax = css.includes('@tailwind base') || css.includes('@tailwind components');

      // Detect RGB-triplet-as-HSL bug: AI wrote "--background: 10 10 10" (RGB intent)
      // but shadcn uses hsl(var(--background)) which treats it as HSL → invisible content.
      // HSL values have a "%" on the second and third number: "0 0% 100%". RGB triplets don't.
      // If ANY of background/foreground/primary look like RGB triplets, rewrite the theme block.
      const rgbTripletInVars = /--(?:background|foreground|primary|card|popover|muted|accent|border|ring)\s*:\s*\d+\s+\d+\s+\d+\s*;/i.test(css);
      if (twVersion < 4 && rgbTripletInVars) {
        log.warn(`[Workspace] Detected RGB triplets in shadcn HSL variables for ${projectId} — rewriting :root block with valid HSL defaults`);
        // Replace ALL :root blocks with a single valid shadcn dark-theme block.
        // This is a fallback — the AI's intent was dark mode (numbers like 10 10 10 near black),
        // so we use the default shadcn dark values which produce a legible UI.
        const darkShadcnRoot = `:root {\n  --background: 0 0% 4%;\n  --foreground: 0 0% 98%;\n  --card: 0 0% 7%;\n  --card-foreground: 0 0% 98%;\n  --popover: 0 0% 7%;\n  --popover-foreground: 0 0% 98%;\n  --primary: 43 74% 52%;\n  --primary-foreground: 0 0% 4%;\n  --secondary: 0 0% 12%;\n  --secondary-foreground: 0 0% 98%;\n  --muted: 0 0% 12%;\n  --muted-foreground: 0 0% 64%;\n  --accent: 0 0% 15%;\n  --accent-foreground: 0 0% 98%;\n  --destructive: 0 84% 60%;\n  --destructive-foreground: 0 0% 98%;\n  --border: 0 0% 15%;\n  --input: 0 0% 15%;\n  --ring: 43 74% 52%;\n  --radius: 0.5rem;\n}`;
        const fixedCss = css.replace(/:root\s*\{[^}]*\}/g, darkShadcnRoot);
        await fileService.writeFile(projectId, cssPath, fixedCss);
        log.info(`[Workspace] Rewrote ${cssPath} with valid HSL variables`);
      }

      if (twVersion >= 4 && hasV3Syntax) {
        // v4 installed but v3 CSS → convert to v4
        log.info(`[Workspace] Fixing Tailwind v3→v4 syntax in globals.css for ${projectId}`);
        const v4Css = `@import "tailwindcss";\n\n@theme inline {\n  --color-background: hsl(0 0% 100%);\n  --color-foreground: hsl(222.2 84% 4.9%);\n  --color-primary: hsl(222.2 47.4% 11.2%);\n  --color-primary-foreground: hsl(210 40% 98%);\n  --color-secondary: hsl(210 40% 96.1%);\n  --color-secondary-foreground: hsl(222.2 47.4% 11.2%);\n  --color-muted: hsl(210 40% 96.1%);\n  --color-muted-foreground: hsl(215.4 16.3% 46.9%);\n  --color-accent: hsl(210 40% 96.1%);\n  --color-accent-foreground: hsl(222.2 47.4% 11.2%);\n  --color-destructive: hsl(0 84.2% 60.2%);\n  --color-destructive-foreground: hsl(210 40% 98%);\n  --color-border: hsl(214.3 31.8% 91.4%);\n  --color-input: hsl(214.3 31.8% 91.4%);\n  --color-ring: hsl(222.2 84% 4.9%);\n  --radius-lg: 0.5rem;\n  --radius-md: calc(0.5rem - 2px);\n  --radius-sm: calc(0.5rem - 4px);\n}\n\n@layer base {\n  * {\n    border-color: var(--color-border);\n  }\n  body {\n    background-color: var(--color-background);\n    color: var(--color-foreground);\n  }\n}\n`;
        await fileService.writeFile(projectId, cssPath, v4Css);

        // Ensure postcss uses @tailwindcss/postcss for v4
        for (const pcFile of ['postcss.config.mjs', 'postcss.config.js']) {
          const pcResult = await fileService.readFile(projectId, pcFile);
          const pcContent = pcResult.success ? pcResult.data?.content : null;
          if (pcContent && !pcContent.includes('@tailwindcss/postcss')) {
            log.info(`[Workspace] Fixing postcss config for Tailwind v4 in ${projectId}`);
            const v4PostCss = pcFile.endsWith('.mjs')
              ? `/** @type {import("postcss-load-config").Config} */\nconst config = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\nexport default config;\n`
              : `module.exports = {\n  plugins: {\n    "@tailwindcss/postcss": {},\n  },\n};\n`;
            await fileService.writeFile(projectId, pcFile, v4PostCss);
            break;
          }
        }
      } else if (twVersion < 4 && hasV4Syntax) {
        // v3 installed but v4 CSS → convert to v3
        log.info(`[Workspace] Fixing Tailwind v4→v3 syntax in globals.css for ${projectId}`);
        const v3Css = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n  --background: 0 0% 100%;\n  --foreground: 222.2 84% 4.9%;\n  --card: 0 0% 100%;\n  --card-foreground: 222.2 84% 4.9%;\n  --popover: 0 0% 100%;\n  --popover-foreground: 222.2 84% 4.9%;\n  --primary: 222.2 47.4% 11.2%;\n  --primary-foreground: 210 40% 98%;\n  --secondary: 210 40% 96.1%;\n  --secondary-foreground: 222.2 47.4% 11.2%;\n  --muted: 210 40% 96.1%;\n  --muted-foreground: 215.4 16.3% 46.9%;\n  --accent: 210 40% 96.1%;\n  --accent-foreground: 222.2 47.4% 11.2%;\n  --destructive: 0 84.2% 60.2%;\n  --destructive-foreground: 210 40% 98%;\n  --border: 214.3 31.8% 91.4%;\n  --input: 214.3 31.8% 91.4%;\n  --ring: 222.2 84% 4.9%;\n  --radius: 0.5rem;\n}\n\n@layer base {\n  * {\n    border-color: hsl(var(--border));\n  }\n  body {\n    background-color: hsl(var(--background));\n    color: hsl(var(--foreground));\n  }\n}\n`;
        await fileService.writeFile(projectId, cssPath, v3Css);

        // Fix postcss to use tailwindcss (v3)
        for (const pcFile of ['postcss.config.mjs', 'postcss.config.js']) {
          const pcResult = await fileService.readFile(projectId, pcFile);
          const pcContent = pcResult.success ? pcResult.data?.content : null;
          if (pcContent && pcContent.includes('@tailwindcss/postcss')) {
            log.info(`[Workspace] Fixing postcss config for Tailwind v3 in ${projectId}`);
            const v3PostCss = pcFile.endsWith('.mjs')
              ? `/** @type {import("postcss-load-config").Config} */\nconst config = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\nexport default config;\n`
              : `module.exports = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`;
            await fileService.writeFile(projectId, pcFile, v3PostCss);
            break;
          }
        }
      }
    } catch {
      // Non-critical — don't block warming
    }
  }

  /**
   * Ensure CSS pipeline is correct for Next.js before build.
   * Checks globals.css, layout.tsx import, postcss config, tailwind config.
   * Removes CDN injection (production build compiles CSS).
   */
  private async ensureCSSPipeline(projectId: string): Promise<void> {
    try {
      // 1. Ensure globals.css has Tailwind directives
      const globalsResult = await fileService.readFile(projectId, 'app/globals.css');
      if (globalsResult.success && globalsResult.data?.content) {
        const globals = globalsResult.data.content;
        if (!globals.includes('@tailwind') && !globals.includes('@import "tailwindcss"')) {
          log.info(`[CSS] globals.css missing Tailwind directives — injecting`);
          await fileService.writeFile(projectId, 'app/globals.css',
            `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n${globals}`);
        }
      }

      // 2. Ensure layout.tsx imports globals.css + remove CDN
      const layoutResult = await fileService.readFile(projectId, 'app/layout.tsx');
      if (layoutResult.success && layoutResult.data?.content) {
        let layout = layoutResult.data.content;
        let changed = false;
        if (!layout.includes('globals.css') && !layout.includes('global.css')) {
          layout = "import './globals.css';\n" + layout;
          changed = true;
          log.info(`[CSS] layout.tsx missing globals.css import — injected`);
        }
        if (layout.includes('cdn.tailwindcss.com')) {
          layout = layout
            .replace(/.*cdn\.tailwindcss\.com.*\n?/g, '')
            .replace(/import Script from ['"]next\/script['"];?\n?/g, '');
          changed = true;
          log.info(`[CSS] Removed CDN from layout.tsx`);
        }
        if (changed) await fileService.writeFile(projectId, 'app/layout.tsx', layout);
      }

      // 3. Ensure postcss.config exists
      const pcCheck = await fileService.readFile(projectId, 'postcss.config.mjs');
      const pcCheck2 = await fileService.readFile(projectId, 'postcss.config.js');
      if (!pcCheck.success && !pcCheck2.success) {
        await fileService.writeFile(projectId, 'postcss.config.mjs',
          'const config = {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\nexport default config;\n');
        log.info(`[CSS] Created postcss.config.mjs`);
      }

      // 4. Ensure tailwind.config exists
      const twCheck = await fileService.readFile(projectId, 'tailwind.config.ts');
      const twCheck2 = await fileService.readFile(projectId, 'tailwind.config.js');
      if (!twCheck.success && !twCheck2.success) {
        await fileService.writeFile(projectId, 'tailwind.config.ts',
          `import type { Config } from "tailwindcss";\n\nconst config: Config = {\n  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],\n  theme: { extend: {} },\n  plugins: [],\n};\nexport default config;\n`);
        log.info(`[CSS] Created tailwind.config.ts`);
      }

      log.info(`[CSS] Pipeline check complete for ${projectId}`);
    } catch (err: any) {
      log.warn(`[CSS] Pipeline repair failed (non-fatal): ${err.message}`);
    }
  }

  /**
   * Start preview for a project. SSE streaming of progress.
   */
  async startPreview(
    projectId: string,
    userId: string,
    onProgress?: ProgressCallback,
    repoUrl?: string,
    githubToken?: string,
    onLog?: (line: string) => void,
  ): Promise<PreviewResult> {
    const startTime = Date.now();

    // Fast path: session exists + dev server running (or console project with container ready)
    const existingSession = await sessionService.get(projectId, userId);
    if (existingSession) {
      // Console projects: if container exists AND agent healthy, return immediately
      // (the frontend interactive terminal handles program execution via WebSocket PTY)
      const storedInfo = existingSession.projectInfo;
      if (storedInfo?.hasWebUI === false) {
        const agentHealthy = await containerLifecycleService.isHealthy(existingSession.agentUrl);
        if (agentHealthy) {
          const freshInfo = await projectDetectorService.detect(projectId);
          if (freshInfo.hasWebUI === false) {
            const elapsed = Date.now() - startTime;
            log.info(`[Workspace] Console fast path for ${projectId} — ${elapsed}ms (container ready, PTY will execute)`);
            onProgress?.('starting', `Terminal ready (${elapsed}ms)`);
            return {
              success: true,
              previewUrl: undefined,
              agentUrl: existingSession.agentUrl,
              containerId: existingSession.containerId,
              previewToken: existingSession.accessToken,
              projectInfo: freshInfo,
              hasWebUI: false,
            };
          }
        } else {
          log.warn(`[Workspace] Console fast path: agent unhealthy for ${projectId}, falling through to slow path`);
        }
      }

      const devRunning = await devServerService.isRunning(existingSession.agentUrl);
      if (devRunning) {
        // Re-detect project type to catch mismatches (e.g. old "unknown" now detected as monorepo)
        const freshInfo = await projectDetectorService.detect(projectId);
        const storedType = existingSession.projectInfo?.type;
        if (storedType && storedType !== freshInfo.type) {
          log.warn(`[Workspace] Project type changed: ${storedType} → ${freshInfo.type} for ${projectId}, restarting dev server`);
          await devServerService.stop(existingSession).catch(() => {});
          existingSession.projectInfo = freshInfo;
          // Fall through to slow path to reinstall + restart
        } else {
          // Check if server is returning 500 with known errors (env vars, missing modules)
          const appError = await devServerService.checkResponseForErrors(existingSession.agentUrl);
          if (appError) {
            log.warn(`[Workspace] Fast path: app broken for ${projectId}: ${appError.substring(0, 100)}`);
            // Next.js cache corruption — clear contents and fall through to slow path
            if (/Modulo non trovato: \.\/\d+\.js|Cannot find module '\.\/\d+\.js'|routes-manifest\.json|middleware-manifest\.json|webpack\/[^']+\.pack\.gz|MODULE_NOT_FOUND.*next\/dist\/server|__webpack_modules__\[[^\]]+\] is not a function|__webpack_require__\([^)]+\) is not a function|Loading chunk \d+ failed/.test(appError)) {
              log.warn(`[Workspace] Next.js cache corruption detected, clearing and restarting for ${projectId}`);
              await devServerService.stop(existingSession).catch(() => {});
              await dockerService.exec(existingSession.agentUrl, 'find .next -mindepth 1 -delete 2>/dev/null || true', '/home/coder/project', 30000, true).catch(() => {});
              existingSession.projectInfo = freshInfo;
              // Fall through to slow path
            } else {
              throw new Error(appError);
            }
          }

          const elapsed = Date.now() - startTime;
          log.info(`[Workspace] Fast path for ${projectId} — ${elapsed}ms`);
          onProgress?.('starting', `Preview ready (fast path, ${elapsed}ms)`);
          const fastPathInfo = existingSession.projectInfo || freshInfo;
          return {
            success: true,
            previewUrl: fastPathInfo.hasWebUI === false ? undefined : this.buildPreviewUrl(existingSession),
            agentUrl: existingSession.agentUrl,
            containerId: existingSession.containerId,
            previewToken: existingSession.accessToken,
            projectInfo: fastPathInfo,
            hasWebUI: fastPathInfo.hasWebUI !== false,
          };
        }
      }
    }

    // Slow path: full setup
    onProgress?.('container', 'Creating container...');
    const session = await this.getOrCreateContainer(projectId, userId);

    // Clone if needed
    if (repoUrl) {
      const hasFiles = await fileService.exists(projectId, 'package.json');
      if (!hasFiles) {
        onProgress?.('clone', 'Cloning repository...');
        await this.cloneRepository(projectId, repoUrl, githubToken);
      }
    }

    // Fix macOS→Linux case-sensitivity mismatches in imports (e.g. leftbar.scss vs leftBar.scss)
    const caseFixes = await caseSensitivityService.fix(projectId);
    if (caseFixes > 0) {
      log.info(`[Workspace] Fixed ${caseFixes} case-sensitivity mismatch(es) for ${projectId}`);
    }

    // Detect project
    onProgress?.('detect', 'Detecting project type...');
    const projectInfo = await projectDetectorService.detect(projectId);
    session.projectInfo = projectInfo;

    // Install deps (skip for console projects without installCommand and static/unknown)
    const skipInstall = this.shouldSkipInstall(projectInfo);
    if (!skipInstall) {
      onProgress?.('install', `Installing dependencies (${projectInfo.packageManager || 'bun'})...`);
      await dependencyService.install(projectId, session, projectInfo, (message) => {
        onProgress?.('install', message);
      }, onLog);
    }

    // Start dev server (console projects skip — frontend PTY handles execution)
    if (projectInfo.hasWebUI === false) {
      // Console: container is ready, frontend interactive terminal will execute via WebSocket PTY
      onProgress?.('server', `Terminal ready for ${projectInfo.type}`);
    } else {
      // Web: start dev server via /setup (long-running)
      onProgress?.('server', `Starting ${projectInfo.type} dev server...`);
      onLog?.(`$ ${projectInfo.startCommand}`);
      await devServerService.start(session, projectInfo);
    }

    session.preparedAt = Date.now();
    await sessionService.set(projectId, userId, session);

    // Start file watcher
    fileWatcherService.startWatching(projectId).catch(() => {});

    const elapsed = Date.now() - startTime;
    onProgress?.('starting', projectInfo.hasWebUI === false ? `Terminal ready (${elapsed}ms)` : `Preview ready (${elapsed}ms)`);
    log.info(`[Workspace] Preview started for ${userId}:${projectId} in ${elapsed}ms`);

    return {
      success: true,
      previewUrl: projectInfo.hasWebUI === false ? undefined : this.buildPreviewUrl(session),
      agentUrl: session.agentUrl,
      containerId: session.containerId,
      previewToken: session.accessToken,
      projectInfo,
      hasWebUI: projectInfo.hasWebUI !== false,
    };
  }

  /**
   * Stop preview (kill dev server, keep container)
   */
  async stopPreview(projectId: string, userId: string): Promise<void> {
    const session = await sessionService.get(projectId, userId);
    if (session) {
      await devServerService.stop(session);
    }
  }

  /**
   * Release container entirely
   */
  async release(projectId: string, userId: string): Promise<void> {
    fileWatcherService.stopWatching(projectId);
    logWatcherService.stop(projectId);
    // Kill dev server before destroying container
    const session = await sessionService.get(projectId, userId);
    if (session) {
      await devServerService.stop(session).catch(() => {});
    }
    await containerLifecycleService.destroy(projectId, userId);
  }

  /**
   * Execute a command inside the container
   */
  async exec(projectId: string, userId: string, command: string, cwd = '/home/coder/project'): Promise<ExecResult> {
    const session = await this.getOrCreateContainer(projectId, userId);
    return dockerService.exec(session.agentUrl, command, cwd);
  }

  /**
   * Parse a git hosting URL to extract base repo URL, branch, and subdirectory path.
   * Supports GitHub (/tree/), GitLab (/-/tree/), Bitbucket (/src/).
   */
  parseRepoUrl(url: string): { repoUrl: string; branch: string | null; subPath: string | null } {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean); // ['owner', 'repo', 'tree', 'branch', ...path]

      if (parts.length < 2) return { repoUrl: url, branch: null, subPath: null };

      const host = u.hostname.toLowerCase();

      // GitHub: /owner/repo/tree/branch/path...
      if (host.includes('github.com') && parts.length > 3 && parts[2] === 'tree') {
        const repoUrl = `${u.protocol}//${u.host}/${parts[0]}/${parts[1]}`;
        const branch = parts[3];
        const subPath = parts.length > 4 ? parts.slice(4).join('/') : null;
        return { repoUrl, branch, subPath };
      }

      // GitLab: /owner/repo/-/tree/branch/path...
      if ((host.includes('gitlab.com') || host.includes('gitlab.')) && parts.length > 4 && parts[2] === '-' && parts[3] === 'tree') {
        const repoUrl = `${u.protocol}//${u.host}/${parts[0]}/${parts[1]}`;
        const branch = parts[4];
        const subPath = parts.length > 5 ? parts.slice(5).join('/') : null;
        return { repoUrl, branch, subPath };
      }

      // Bitbucket: /owner/repo/src/branch/path...
      if ((host.includes('bitbucket.org') || host.includes('bitbucket.')) && parts.length > 3 && parts[2] === 'src') {
        const repoUrl = `${u.protocol}//${u.host}/${parts[0]}/${parts[1]}`;
        const branch = parts[3];
        const subPath = parts.length > 4 ? parts.slice(4).join('/') : null;
        return { repoUrl, branch, subPath };
      }

      // No subdirectory pattern detected — return as-is
      return { repoUrl: url, branch: null, subPath: null };
    } catch {
      return { repoUrl: url, branch: null, subPath: null };
    }
  }

  /**
   * Clone a repository to the project directory on NVMe
   * Supports GitHub, GitLab, Bitbucket, and Gitea
   * Handles subdirectory URLs (e.g. /tree/master/examples/react)
   */
  async cloneRepository(projectId: string, repoUrl: string, token?: string, branch?: string): Promise<Result> {
    const projectDir = path.join(config.projectsRoot, projectId);

    // Skip if directory already has files (already cloned)
    const hasFiles = await fileService.exists(projectId, '.git');
    if (hasFiles) {
      log.info(`[Workspace] Already cloned for ${projectId}, skipping`);
      return { success: true };
    }

    // Parse URL to extract base repo, branch, and subdirectory
    const parsed = this.parseRepoUrl(repoUrl);
    let cloneUrl = parsed.repoUrl;
    const effectiveBranch = branch || parsed.branch;
    const subPath = parsed.subPath;

    if (subPath) {
      log.info(`[Workspace] Detected subdirectory: ${subPath} (branch: ${effectiveBranch})`);
    }

    if (token && !cloneUrl.includes('@')) {
      // Build authenticated URL based on provider
      const lowerUrl = cloneUrl.toLowerCase();

      if (lowerUrl.includes('github.com')) {
        cloneUrl = cloneUrl.replace('https://', `https://${token}@`);
      } else if (lowerUrl.includes('gitlab.com') || lowerUrl.includes('gitlab.')) {
        cloneUrl = cloneUrl.replace('https://', `https://oauth2:${token}@`);
      } else if (lowerUrl.includes('bitbucket.org') || lowerUrl.includes('bitbucket.')) {
        cloneUrl = cloneUrl.replace('https://', `https://${token}@`);
      } else {
        cloneUrl = cloneUrl.replace('https://', `https://${token}@`);
      }
    }

    log.info(`[Workspace] Cloning ${parsed.repoUrl} to ${projectId}${effectiveBranch ? ` (branch: ${effectiveBranch})` : ''}`);
    const branchFlag = effectiveBranch ? `--branch ${shellEscape(effectiveBranch)} ` : '';
    const result = await execShell(
      `git -c safe.directory='*' clone --depth 1 ${branchFlag}${shellEscape(cloneUrl)} ${shellEscape(projectDir)}`,
      '/tmp',
      120000,
    );

    if (result.exitCode !== 0) {
      log.error(`[Workspace] Clone failed: ${result.stderr}`);
      return { success: false, error: result.stderr };
    }

    // If subdirectory was specified, extract it to project root
    if (subPath) {
      const subDir = path.join(projectDir, subPath);
      // Use a tmp dir OUTSIDE projectDir to avoid rm -rf deleting it
      const tmpDir = path.join(config.projectsRoot, `__sub_tmp_${projectId}`);
      const checkResult = await execShell(`test -d ${shellEscape(subDir)} && echo exists`, '/tmp', 5000);

      if (checkResult.stdout.trim() !== 'exists') {
        log.error(`[Workspace] Subdirectory '${subPath}' not found in repository`);
        await execShell(`rm -rf ${shellEscape(projectDir)}`, '/tmp', 10000);
        return { success: false, error: `Subdirectory '${subPath}' not found in repository` };
      }

      // Copy subdirectory to temp, wipe project dir, move back
      await execShell(
        `cp -a ${shellEscape(subDir)} ${shellEscape(tmpDir)} && rm -rf ${shellEscape(projectDir)} && mv ${shellEscape(tmpDir)} ${shellEscape(projectDir)}`,
        '/tmp',
        30000,
      );
      log.info(`[Workspace] Extracted subdirectory '${subPath}' to project root`);
    }

    log.info(`[Workspace] Clone complete for ${projectId}`);
    return { success: true };
  }

  /**
   * List files for a project (reads NVMe directly, no container needed)
   */
  async listFiles(projectId: string): Promise<{ path: string; size?: number }[]> {
    const result = await fileService.listAllFiles(projectId);
    return result.data || [];
  }

  /**
   * Build the preview URL for a session.
   * Routes through the backend proxy so iOS only needs to reach port 3001.
   */
  private buildPreviewUrl(session: Session): string {
    // Subdomain-based preview: {projectId}.drape.info (direct to container, no proxy)
    // Wildcard DNS is on *.drape.info — always use drape.info as base, not dev.drape.info
    const publicUrl = config.publicUrl || '';
    if (publicUrl.includes('drape.info')) {
      return `https://${session.projectId}.drape.info/`;
    }
    // Fallback: path-based proxy for localhost dev
    const base = publicUrl || `http://localhost:${config.port}`;
    return `${base}/preview/${session.projectId}/`;
  }
}

export const workspaceService = new WorkspaceService();
