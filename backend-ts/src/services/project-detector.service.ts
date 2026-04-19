import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { ProjectInfo, ProjectType, PackageManager } from '../types';
import { log } from '../utils/logger';

class ProjectDetectorService {
  /**
   * Detect project type and configuration by reading files on NVMe directly
   */
  async detect(projectId: string): Promise<ProjectInfo> {
    const projectDir = path.join(config.projectsRoot, projectId);

    // Read .drape.json for custom overrides (e.g. startCommand)
    const drapeConfig = await this.readJsonSafe(projectDir, '.drape.json') as any;

    const result = await this.detectInternal(projectDir);

    // Apply custom startCommand from .drape.json
    if (drapeConfig?.startCommand && typeof drapeConfig.startCommand === 'string') {
      log.info(`[ProjectDetector] Using custom startCommand from .drape.json: ${drapeConfig.startCommand}`);
      result.startCommand = drapeConfig.startCommand;
    }

    return result;
  }

  private async detectInternal(projectDir: string): Promise<ProjectInfo> {

    const [hasPackageJson, hasNextConfig, hasViteConfig, hasPnpmLock, hasYarnLock, hasNpmLock, hasBunLock, packageJson, hasSvelteConfig, hasAstroConfig, hasAngularJson, hasGoMod, hasGemfile, hasRailsRoutes, hasNuxtConfig, hasPubspec, hasManagePy, hasComposerJson, hasArtisan] =
      await Promise.all([
        this.fileExists(projectDir, 'package.json'),
        this.hasAnyFile(projectDir, ['next.config.js', 'next.config.mjs', 'next.config.ts']),
        this.hasAnyFile(projectDir, ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']),
        this.fileExists(projectDir, 'pnpm-lock.yaml'),
        this.fileExists(projectDir, 'yarn.lock'),
        this.fileExists(projectDir, 'package-lock.json'),
        this.hasAnyFile(projectDir, ['bun.lockb', 'bun.lock']),
        this.readJsonSafe(projectDir, 'package.json'),
        this.hasAnyFile(projectDir, ['svelte.config.js', 'svelte.config.ts']),
        this.hasAnyFile(projectDir, ['astro.config.mjs', 'astro.config.ts']),
        this.fileExists(projectDir, 'angular.json'),
        this.fileExists(projectDir, 'go.mod'),
        this.fileExists(projectDir, 'Gemfile'),
        this.fileExists(projectDir, 'config/routes.rb'),
        this.hasAnyFile(projectDir, ['nuxt.config.ts', 'nuxt.config.js']),
        this.fileExists(projectDir, 'pubspec.yaml'),
        this.fileExists(projectDir, 'manage.py'),
        this.fileExists(projectDir, 'composer.json'),
        this.fileExists(projectDir, 'artisan'),
      ]);

    const packageManager = this.detectPackageManager(hasPnpmLock, hasYarnLock, hasNpmLock, hasBunLock);

    // Detect project type

    // Flutter Web (pubspec.yaml with flutter dep) — check FIRST because Flutter repos
    // may also contain package.json for a backend, and we don't want Node.js detection to win.
    if (hasPubspec) {
      const pubspec = await this.readFileSafe(projectDir, 'pubspec.yaml');
      if (pubspec && pubspec.includes('flutter:')) {
        return {
          type: 'flutter',
          description: 'Flutter Web project',
          startCommand: 'flutter build web --no-tree-shake-icons -O1 2>&1 && npx serve -s build/web -l 3000',
          port: 3000,
          installCommand: 'mkdir -p /home/node/.pub-cache && flutter pub get',
        };
      }
    }

    // Require package.json at root when matching by config file alone.
    // A next.config.js without package.json is likely a symlink from app/ (App Router pattern)
    // and should fall through to the monorepo/subdirectory detection below.
    if ((hasNextConfig && hasPackageJson) || this.hasNextDep(packageJson)) {
      return this.nextjsProject(packageJson, packageManager);
    }

    // SvelteKit (before Vite — SvelteKit uses Vite under the hood)
    if (hasSvelteConfig || this.hasDep(packageJson, 'svelte')) {
      return this.svelteProject(packageJson, packageManager);
    }

    // Astro (before Vite — Astro uses Vite under the hood)
    if (hasAstroConfig || this.hasDep(packageJson, 'astro')) {
      return this.astroProject(packageJson, packageManager);
    }

    // Remix (before Vite — Remix uses Vite)
    if (this.hasDep(packageJson, '@remix-run/dev')) {
      return this.remixProject(packageJson, packageManager);
    }

    // Nuxt (before Vite — Nuxt uses Vite/Nitro under the hood)
    if (hasNuxtConfig || this.hasDep(packageJson, 'nuxt')) {
      return this.nuxtProject(packageJson, packageManager);
    }

    // Angular (before generic Node.js)
    if (hasAngularJson || this.hasDep(packageJson, '@angular/core')) {
      return this.angularProject(packageJson, packageManager);
    }

    // Solid.js (before generic Vite — Solid uses Vite)
    if (this.hasDep(packageJson, 'solid-js')) {
      return this.solidProject(packageJson, packageManager);
    }

    if (hasViteConfig || this.hasViteDep(packageJson)) {
      return this.viteProject(packageJson, packageManager);
    }

    // Expo / React Native Web
    if (this.hasExpoDep(packageJson)) {
      return this.expoProject(packageJson, packageManager);
    }

    // Monorepo: check common subdirectories + scan apps/* and packages/*
    // IMPORTANT: must run BEFORE the generic nodejs fallback
    const staticDirs = ['client', 'frontend', 'web', 'app'];
    const dynamicDirs = await this.listSubdirs(projectDir, ['apps', 'packages']);
    const subdirs = [...staticDirs, ...dynamicDirs];

    // Check if root has workspaces (npm/pnpm/yarn workspaces)
    const isWorkspace = !!(packageJson?.workspaces || await this.fileExists(projectDir, 'pnpm-workspace.yaml'));

    for (const subdir of subdirs) {
      const subPkg = await this.readJsonSafe(projectDir, `${subdir}/package.json`);
      if (subPkg) {
        const subHasNext = this.hasNextDep(subPkg) || await this.hasAnyFile(projectDir, [`${subdir}/next.config.js`, `${subdir}/next.config.mjs`, `${subdir}/next.config.ts`]);
        const subHasVite = this.hasViteDep(subPkg) || await this.hasAnyFile(projectDir, [`${subdir}/vite.config.js`, `${subdir}/vite.config.ts`]);
        const subPm = this.detectPackageManager(
          await this.fileExists(projectDir, `${subdir}/pnpm-lock.yaml`) || hasPnpmLock,
          await this.fileExists(projectDir, `${subdir}/yarn.lock`) || hasYarnLock,
          await this.fileExists(projectDir, `${subdir}/package-lock.json`) || hasNpmLock,
          await this.hasAnyFile(projectDir, [`${subdir}/bun.lockb`, `${subdir}/bun.lock`]) || hasBunLock,
        );

        // For workspaces, install from root; otherwise install in subdir
        const rootInstall = isWorkspace
          ? this.installCommandForPackageManager(subPm)
          : null;

        if (subHasNext) {
          // If subdir is 'app' and there's no root package.json, the project root IS
          // the Next.js project and 'app/' is the App Router directory — don't cd into it.
          // Next.js run from project root will find app/ as the router directory.
          if (subdir === 'app' && !hasPackageJson) {
            const info = this.nextjsProject(subPkg, subPm);
            info.description = `Next.js project (app/ router)`;
            // app/ is BOTH the App Router directory AND the project root (has package.json, configs).
            // Strategy: run Next.js from project root so it finds app/ as the router dir.
            // 1. Symlink config files to root (postcss, tailwind, next.config)
            // 2. Copy package.json to root and install deps there
            // 3. Remove app/node_modules to avoid Tailwind scanning it (./app/**/*.ts pattern)
            const setup = [
              'for f in app/postcss.config.* app/tailwind.config.* app/next.config.*; do [ -f "$f" ] && ln -sf "$f" . 2>/dev/null; done',
            ].join('; ');
            const installCmd = info.installCommand || this.installCommandForPackageManager(subPm, { frozenLockfile: true });
            info.startCommand = `${setup}; ${info.startCommand}`;
            info.installCommand = `cp app/package.json . 2>/dev/null; [ -f app/package-lock.json ] && cp app/package-lock.json . 2>/dev/null; ${installCmd}; rm -rf app/node_modules 2>/dev/null`;
            return info;
          }
          const info = this.nextjsProject(subPkg, subPm);
          info.description = `Next.js monorepo (${subdir}/)`;
          info.startCommand = `cd ${subdir} && ${info.startCommand}`;
          info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || this.installCommandForPackageManager(subPm)}`;
          return info;
        }
        if (subHasVite) {
          const info = this.viteProject(subPkg, subPm);
          info.description = `Vite monorepo (${subdir}/)`;
          info.startCommand = `cd ${subdir} && ${info.startCommand}`;
          info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || this.installCommandForPackageManager(subPm)}`;
          return info;
        }
        if (this.hasExpoDep(subPkg)) {
          const info = this.expoProject(subPkg, subPm);
          info.description = `Expo monorepo (${subdir}/)`;
          info.startCommand = `cd ${subdir} && ${info.startCommand}`;
          info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || this.installCommandForPackageManager(subPm)}`;
          return info;
        }

        // Generic Node.js in subdirectory
        const info = this.nodejsProject(subPkg, subPm);
        info.description = `Node.js monorepo (${subdir}/)`;
        info.startCommand = `cd ${subdir} && ${info.startCommand}`;
        info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || this.installCommandForPackageManager(subPm)}`;
        return info;
      }
    }

    // JavaScript console (index.js without web framework, package.json optional)
    // Must run BEFORE generic Node.js fallback, otherwise console templates with
    // package.json are misdetected as web projects.
    if (await this.hasAnyFile(projectDir, ['index.js'])) {
      const hasRootIndexHtml = await this.hasAnyFile(projectDir, ['index.html']);
      if (!hasRootIndexHtml && !this.hasWebDeps(packageJson)) {
        return {
          type: 'javascript-console',
          description: 'JavaScript console application',
          startCommand: 'timeout 30 node index.js < /dev/null 2>&1; true',
          port: 0,
          hasWebUI: false,
        };
      }
    }

    // Static HTML: has any .html files — check BEFORE generic Node.js fallback.
    // By this point all framework-specific checks have already run (Next.js, Vite,
    // Svelte, Astro, Remix, Nuxt, Angular, Solid, Expo). If none matched and
    // .html files exist, it's a static site — even if package.json has deps
    // (e.g. express for a separate API, or vercel dev as dev script).
    if (await this.hasHtmlFiles(projectDir)) {
      return {
        type: 'static',
        description: 'Static HTML project',
        startCommand: 'npx serve . -l 3000',
        port: 3000,
      };
    }

    // Generic Node.js (no framework detected, no monorepo subdirs found)
    if (hasPackageJson) {
      return this.nodejsProject(packageJson, packageManager);
    }

    // Laravel (artisan + composer.json)
    if (hasArtisan && hasComposerJson) {
      return {
        type: 'laravel',
        description: 'Laravel project',
        startCommand: 'mkdir -p bootstrap/cache storage/framework/{sessions,views,cache} storage/logs 2>/dev/null; test -f .env || (test -f .env.example && cp .env.example .env || echo "APP_KEY=base64:dGhpc2lzYWR1bW15a2V5Zm9yZGV2ZWxvcG1lbnQx" > .env); php artisan key:generate --force 2>/dev/null; php artisan config:clear 2>/dev/null; php artisan serve --host=0.0.0.0 --port=3000',
        port: 3000,
        installCommand: 'composer install',
      };
    }

    // Django (manage.py + settings)
    if (hasManagePy) {
      return {
        type: 'django',
        description: 'Django project',
        startCommand: 'python3 manage.py runserver 0.0.0.0:3000',
        port: 3000,
        installCommand: 'python3 -m pip install --user --break-system-packages -r requirements.txt',
      };
    }

    // FastAPI / Flask (check requirements.txt / pyproject.toml)
    if (await this.hasAnyFile(projectDir, ['requirements.txt', 'pyproject.toml'])) {
      const reqs = await this.readFileSafe(projectDir, 'requirements.txt');
      const pyproject = await this.readFileSafe(projectDir, 'pyproject.toml');
      if ((reqs && reqs.includes('fastapi')) || (pyproject && pyproject.includes('fastapi'))) {
        return {
          type: 'fastapi',
          description: 'FastAPI project',
          startCommand: 'python3 -m uvicorn main:app --host 0.0.0.0 --port 3000 --reload',
          port: 3000,
          installCommand: 'python3 -m pip install --user --break-system-packages -r requirements.txt',
        };
      }
      if ((reqs && reqs.includes('flask')) || (pyproject && pyproject.includes('flask'))) {
        return {
          type: 'flask',
          description: 'Flask project',
          startCommand: 'python3 -m flask run --host=0.0.0.0 --port=3000 --debug',
          port: 3000,
          installCommand: 'python3 -m pip install --user --break-system-packages -r requirements.txt',
        };
      }
    }

    // Check for generic Python (console script — no web framework)
    if (await this.hasAnyFile(projectDir, ['main.py'])) {
      const reqs = await this.readFileSafe(projectDir, 'requirements.txt');
      const hasWebFramework = reqs && (reqs.includes('flask') || reqs.includes('django') || reqs.includes('fastapi'));
      if (!hasWebFramework) {
        return {
          type: 'python-console',
          description: 'Python console application',
          startCommand: 'timeout 30 stdbuf -oL python3 -u main.py < /dev/null 2>&1; true',
          port: 0,
          hasWebUI: false,
          installCommand: reqs ? 'python3 -m pip install --user --break-system-packages -r requirements.txt' : undefined,
        };
      }
    }

    // Generic Python with requirements but no main.py
    if (await this.hasAnyFile(projectDir, ['requirements.txt', 'pyproject.toml', 'setup.py'])) {
      return {
        type: 'python',
        description: 'Python project',
        startCommand: 'python3 -m http.server 3000',
        port: 3000,
      };
    }

    // Go
    if (hasGoMod) {
      return {
        type: 'go',
        description: 'Go project',
        startCommand: 'go run .',
        port: 3000,
      };
    }

    // Ruby / Rails
    if (hasGemfile && hasRailsRoutes) {
      return {
        type: 'ruby',
        description: 'Ruby on Rails project',
        startCommand: 'bundle exec rails s -p 3000 -b 0.0.0.0',
        port: 3000,
        installCommand: 'bundle install',
      };
    }

    // C++ (main.cpp or main.cc)
    const hasMainCpp = await this.fileExists(projectDir, 'main.cpp');
    const hasMainCc = !hasMainCpp && await this.fileExists(projectDir, 'main.cc');
    if (hasMainCpp || hasMainCc) {
      const cppEntry = hasMainCpp ? 'main.cpp' : 'main.cc';
      return {
        type: 'cpp',
        description: 'C++ console application',
        startCommand: `make 2>/dev/null || g++ -o main ${cppEntry} && timeout 10 stdbuf -oL ./main < /dev/null 2>&1; true`,
        port: 0,
        hasWebUI: false,
      };
    }

    // C (main.c)
    if (await this.hasAnyFile(projectDir, ['main.c'])) {
      return {
        type: 'c-lang',
        description: 'C console application',
        startCommand: 'make 2>/dev/null || gcc -o main main.c && timeout 10 stdbuf -oL ./main < /dev/null 2>&1; true',
        port: 0,
        hasWebUI: false,
      };
    }

    // Java (Main.java)
    if (await this.hasAnyFile(projectDir, ['Main.java'])) {
      return {
        type: 'java',
        description: 'Java console application',
        startCommand: 'javac Main.java && timeout 10 java Main < /dev/null 2>&1; true',
        port: 0,
        hasWebUI: false,
      };
    }

    return {
      type: 'unknown',
      description: 'Unknown project type',
      startCommand: 'npx serve . -l 3000',
      port: 3000,
    };
  }

  private nextjsProject(pkg: any, pm: PackageManager): ProjectInfo {
    const scripts = pkg?.scripts || {};
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    const nextVersion = parseInt((deps?.next || '0').replace(/[^\d]/g, '').substring(0, 2));
    // Turbopack crashes on some generated code patterns (app-build-manifest.json ENOENT).
    // Use stable webpack instead — slower but reliable.
    const useTurbopack = false;

    const installCmd = this.installCommandForPackageManager(pm, { frozenLockfile: true });

    // Always use the next binary directly instead of `npm run dev`.
    // npm's exit-handler calls process.exit(0) after stdout flush in non-TTY
    // environments (containers), killing the dev server immediately.
    const devScript = (scripts.dev || '').trim();
    const hasPort = devScript.includes('-p ') || devScript.includes('--port');
    const hasHost = devScript.includes('-H ') || devScript.includes('--hostname');
    const hasTurboOrWebpack = devScript.includes('--turbo') || devScript.includes('--turbopack') || devScript.includes('--webpack');

    const flags: string[] = [];
    if (!hasPort) flags.push('--port 3000');
    if (!hasHost) flags.push('--hostname 0.0.0.0');

    // Dev mode: faster startup (~3-5s vs 60-90s build),
    // per-page compilation errors instead of blocking the entire server.
    if (useTurbopack) flags.push('--turbopack');
    // Disable telemetry: skips the "Attention: Next.js collects..." prompt
    // on first run (which otherwise adds a few seconds of noise on every
    // fresh container) and avoids a DNS+HTTPS round trip to telemetry.nextjs.org.
    const startCommand = `NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next dev ${flags.join(' ')}`;

    return {
      type: 'nextjs',
      description: `Next.js ${nextVersion || ''} project`,
      startCommand,
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
      disableTurbopack: !useTurbopack,
    };
  }

  private viteProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = this.installCommandForPackageManager(pm);

    return {
      type: 'vite',
      description: 'Vite project',
      startCommand: 'npx vite --host 0.0.0.0 --port 3000',
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private nodejsProject(pkg: any, pm: PackageManager): ProjectInfo {
    const scripts = pkg?.scripts || {};
    const installCmd = this.installCommandForPackageManager(pm);
    const runDevCmd = pm === 'pnpm' ? 'pnpm run dev' :
      pm === 'yarn' ? 'yarn dev' :
      pm === 'npm' ? 'npm run dev' :
        'bun run dev';
    const runStartCmd = pm === 'pnpm' ? 'pnpm run start' :
      pm === 'yarn' ? 'yarn start' :
      pm === 'npm' ? 'npm run start' :
        'bun run start';

    let startCommand = 'npx serve -s . -l 3000';
    if (scripts.dev) startCommand = runDevCmd;
    else if (scripts.start) startCommand = runStartCmd;

    return {
      type: 'nodejs',
      description: 'Node.js project',
      startCommand,
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private detectPackageManager(hasPnpm: boolean, hasYarn: boolean, hasNpm = false, hasBun = false): PackageManager {
    if (hasPnpm) return 'pnpm';
    if (hasYarn) return 'yarn';
    if (hasBun) return 'bun';
    if (hasNpm) return 'npm';
    // Default to bun — 5-10x faster than npm for cold installs
    return 'bun';
  }

  private installCommandForPackageManager(
    pm: PackageManager,
    opts: { frozenLockfile?: boolean } = {},
  ): string {
    if (pm === 'pnpm') {
      return opts.frozenLockfile ? 'pnpm install --frozen-lockfile' : 'pnpm install';
    }
    if (pm === 'yarn') {
      return opts.frozenLockfile ? 'yarn install --frozen-lockfile' : 'yarn install';
    }
    if (pm === 'npm') {
      return 'npm install';
    }
    return opts.frozenLockfile ? 'bun install --frozen-lockfile' : 'bun install';
  }

  private hasNextDep(pkg: any): boolean {
    return !!(pkg?.dependencies?.next || pkg?.devDependencies?.next);
  }

  private hasViteDep(pkg: any): boolean {
    return !!(pkg?.dependencies?.vite || pkg?.devDependencies?.vite);
  }

  private hasExpoDep(pkg: any): boolean {
    return !!(pkg?.dependencies?.expo || pkg?.devDependencies?.expo);
  }

  private expoProject(pkg: any, pm: PackageManager): ProjectInfo {
    // Expo/RN projects almost always have peer dep conflicts
    const installCmd = this.installCommandForPackageManager(pm);

    // Always force --port 3000 so isRunning/preview checks work correctly.
    // Don't use custom scripts (e.g. "npm run web") because they may not include --port.
    // Expo's --port flag controls the Metro bundler port which also serves the web bundle.
    // CI=1 replaces the deprecated --non-interactive flag
    const startCommand = 'CI=1 npx expo start --web --port 3000';

    return {
      type: 'expo',
      description: 'Expo / React Native Web project',
      startCommand,
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private svelteProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = this.installCommandForPackageManager(pm);
    return {
      type: 'svelte',
      description: 'SvelteKit project',
      startCommand: 'npx vite --host 0.0.0.0 --port 3000',
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private astroProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = this.installCommandForPackageManager(pm);
    return {
      type: 'astro',
      description: 'Astro project',
      startCommand: 'npx astro dev --host 0.0.0.0 --port 3000',
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private remixProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = this.installCommandForPackageManager(pm);
    return {
      type: 'remix',
      description: 'Remix project',
      startCommand: 'npx remix vite:dev --host 0.0.0.0 --port 3000',
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private angularProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = this.installCommandForPackageManager(pm);
    return {
      type: 'angular',
      description: 'Angular project',
      startCommand: 'npx ng serve --host 0.0.0.0 --port 3000',
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private nuxtProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = this.installCommandForPackageManager(pm);

    // Use nuxi binary directly — npm run dev exits prematurely in non-TTY containers.
    const startCommand = './node_modules/.bin/nuxi dev --host 0.0.0.0 --port 3000';

    return {
      type: 'nuxt',
      description: 'Nuxt project',
      startCommand,
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private solidProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = this.installCommandForPackageManager(pm);
    return {
      type: 'solid',
      description: 'Solid.js project',
      startCommand: 'npx vite --host 0.0.0.0 --port 3000',
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private hasDep(pkg: any, dep: string): boolean {
    return !!(pkg?.dependencies?.[dep] || pkg?.devDependencies?.[dep]);
  }

  private hasWebDeps(pkg: any): boolean {
    const webDeps = ['express', 'koa', 'fastify', 'hapi', 'http-server', 'serve', 'react', 'vue', 'svelte', 'next', 'nuxt', '@angular/core'];
    return webDeps.some(dep => this.hasDep(pkg, dep));
  }

  /**
   * List subdirectories inside parent dirs (e.g. apps/*, packages/*)
   */
  private async listSubdirs(projectDir: string, parents: string[]): Promise<string[]> {
    const result: string[] = [];
    for (const parent of parents) {
      try {
        const entries = await fs.readdir(path.join(projectDir, parent), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            result.push(`${parent}/${entry.name}`);
          }
        }
      } catch {
        // parent dir doesn't exist
      }
    }
    return result;
  }

  private async fileExists(dir: string, name: string): Promise<boolean> {
    try {
      await fs.access(path.join(dir, name));
      return true;
    } catch {
      return false;
    }
  }

  private async hasAnyFile(dir: string, names: string[]): Promise<boolean> {
    for (const name of names) {
      if (await this.fileExists(dir, name)) return true;
    }
    return false;
  }

  /** Check if the root directory contains any .html files */
  private async hasHtmlFiles(dir: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir);
      return entries.some(e => e.endsWith('.html'));
    } catch {
      return false;
    }
  }

  private async readFileSafe(dir: string, name: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(dir, name), 'utf-8');
    } catch {
      return null;
    }
  }

  private async readJsonSafe(dir: string, name: string): Promise<any> {
    try {
      const content = await fs.readFile(path.join(dir, name), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
}

export const projectDetectorService = new ProjectDetectorService();
