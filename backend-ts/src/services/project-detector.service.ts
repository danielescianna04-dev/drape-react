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

    const [hasPackageJson, hasNextConfig, hasViteConfig, hasPnpmLock, hasYarnLock, packageJson] =
      await Promise.all([
        this.fileExists(projectDir, 'package.json'),
        this.hasAnyFile(projectDir, ['next.config.js', 'next.config.mjs', 'next.config.ts']),
        this.hasAnyFile(projectDir, ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']),
        this.fileExists(projectDir, 'pnpm-lock.yaml'),
        this.fileExists(projectDir, 'yarn.lock'),
        this.readJsonSafe(projectDir, 'package.json'),
      ]);

    const packageManager = this.detectPackageManager(hasPnpmLock, hasYarnLock);

    // Detect project type
    if (hasNextConfig || this.hasNextDep(packageJson)) {
      return this.nextjsProject(packageJson, packageManager);
    }

    if (hasViteConfig || this.hasViteDep(packageJson)) {
      return this.viteProject(packageJson, packageManager);
    }

    // Expo / React Native Web
    if (this.hasExpoDep(packageJson)) {
      return this.expoProject(packageJson, packageManager);
    }

    // Static HTML: has index.html but no Next/Vite framework deps
    if (await this.hasAnyFile(projectDir, ['index.html'])) {
      const hasFrameworkDep = this.hasNextDep(packageJson) || this.hasViteDep(packageJson);
      if (!hasFrameworkDep) {
        return {
          type: 'static',
          description: 'Static HTML project',
          startCommand: 'npx serve -s . -l 3000',
          port: 3000,
        };
      }
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
        );

        // For workspaces, install from root; otherwise install in subdir
        const rootInstall = isWorkspace
          ? (subPm === 'pnpm' ? 'pnpm install' : subPm === 'yarn' ? 'yarn install' : 'npm install')
          : null;

        if (subHasNext) {
          const info = this.nextjsProject(subPkg, subPm);
          info.description = `Next.js monorepo (${subdir}/)`;
          info.startCommand = `cd ${subdir} && ${info.startCommand}`;
          info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || 'npm install'}`;
          return info;
        }
        if (subHasVite) {
          const info = this.viteProject(subPkg, subPm);
          info.description = `Vite monorepo (${subdir}/)`;
          info.startCommand = `cd ${subdir} && ${info.startCommand}`;
          info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || 'npm install'}`;
          return info;
        }
        if (this.hasExpoDep(subPkg)) {
          const info = this.expoProject(subPkg, subPm);
          info.description = `Expo monorepo (${subdir}/)`;
          info.startCommand = `cd ${subdir} && ${info.startCommand}`;
          info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || 'npm install'}`;
          return info;
        }

        // Generic Node.js in subdirectory
        const info = this.nodejsProject(subPkg, subPm);
        info.description = `Node.js monorepo (${subdir}/)`;
        info.startCommand = `cd ${subdir} && ${info.startCommand}`;
        info.installCommand = rootInstall || `cd ${subdir} && ${info.installCommand || 'npm install'}`;
        return info;
      }
    }

    // Generic Node.js (no framework detected, no monorepo subdirs found)
    if (hasPackageJson) {
      return this.nodejsProject(packageJson, packageManager);
    }

    // Check for Python
    if (await this.hasAnyFile(projectDir, ['requirements.txt', 'pyproject.toml', 'setup.py'])) {
      return {
        type: 'python',
        description: 'Python project',
        startCommand: 'python -m http.server 3000',
        port: 3000,
      };
    }

    return {
      type: 'unknown',
      description: 'Unknown project type',
      startCommand: 'npx serve -s . -l 3000',
      port: 3000,
    };
  }

  private nextjsProject(pkg: any, pm: PackageManager): ProjectInfo {
    const scripts = pkg?.scripts || {};
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    const nextVersion = parseInt((deps?.next || '0').replace(/[^\d]/g, '').substring(0, 2));
    const useTurbopack = nextVersion >= 15;

    const installCmd = pm === 'pnpm' ? 'pnpm install --frozen-lockfile' :
      pm === 'yarn' ? 'yarn install --frozen-lockfile' :
        'npm install';

    // Detect custom dev script
    let startCommand = scripts.dev || `next dev -p 3000`;
    if (!startCommand.includes('-p ') && !startCommand.includes('--port')) {
      startCommand += ' -p 3000';
    }
    if (useTurbopack && !startCommand.includes('--turbo')) {
      startCommand += ' --turbopack';
    }

    return {
      type: 'nextjs',
      description: `Next.js ${nextVersion || ''} project`,
      startCommand: `npx ${startCommand}`,
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
      disableTurbopack: !useTurbopack,
    };
  }

  private viteProject(pkg: any, pm: PackageManager): ProjectInfo {
    const installCmd = pm === 'pnpm' ? 'pnpm install' :
      pm === 'yarn' ? 'yarn install' :
        'npm install';

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
    const installCmd = pm === 'pnpm' ? 'pnpm install' :
      pm === 'yarn' ? 'yarn install' :
        'npm install';

    let startCommand = 'npx serve -s . -l 3000';
    if (scripts.dev) startCommand = `npm run dev`;
    else if (scripts.start) startCommand = `npm start`;

    return {
      type: 'nodejs',
      description: 'Node.js project',
      startCommand,
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
  }

  private detectPackageManager(hasPnpm: boolean, hasYarn: boolean): PackageManager {
    if (hasPnpm) return 'pnpm';
    if (hasYarn) return 'yarn';
    return 'npm';
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
    // Expo/RN projects almost always have peer dep conflicts — use --legacy-peer-deps for npm
    const installCmd = pm === 'pnpm' ? 'pnpm install' :
      pm === 'yarn' ? 'yarn install' :
        'npm install --legacy-peer-deps';

    // Always force --port 3000 so isRunning/preview checks work correctly.
    // Don't use custom scripts (e.g. "npm run web") because they may not include --port.
    // Expo's --port flag controls the Metro bundler port which also serves the web bundle.
    const startCommand = 'npx expo start --web --port 3000 --non-interactive';

    return {
      type: 'expo',
      description: 'Expo / React Native Web project',
      startCommand,
      port: 3000,
      installCommand: installCmd,
      packageManager: pm,
    };
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
