import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { log } from '../utils/logger';

/**
 * Fixes case-sensitivity mismatches in import paths.
 * Projects developed on macOS (case-insensitive FS) often have imports like
 * `import "./leftbar.scss"` when the actual file is `leftBar.scss`.
 * These break on Linux (case-sensitive FS) inside Docker containers.
 */
class CaseSensitivityService {
  private static readonly SOURCE_EXTENSIONS = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.scss', '.sass', '.css', '.less',
  ]);

  /** JS/TS import/require patterns */
  private static readonly JS_IMPORT_REGEX =
    /(?:import\s+(?:.*?\s+from\s+)?|require\s*\(\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g;

  /** SCSS/CSS @import, @use, @forward patterns */
  private static readonly CSS_IMPORT_REGEX =
    /@(?:import|use|forward)\s+['"](\.[^'"]+)['"]/g;

  /** CSS url() references */
  private static readonly CSS_URL_REGEX =
    /url\(\s*['"]?(\.[^'")]+)['"]?\s*\)/g;

  private static readonly SKIP_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', '.cache', '.vite',
  ]);

  /**
   * Scan project source files for case-mismatched imports and rename files to match.
   * Returns count of fixes applied.
   */
  async fix(projectId: string): Promise<number> {
    const projectDir = path.join(config.projectsRoot, projectId);
    let totalFixes = 0;

    try {
      const sourceFiles = await this.collectSourceFiles(projectDir);
      if (sourceFiles.length === 0) return 0;

      // Build a map of directory → actual filenames (case-sensitive)
      const dirCache = new Map<string, string[]>();

      for (const filePath of sourceFiles) {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileDir = path.dirname(filePath);
        const fixes = await this.findMismatches(content, fileDir, filePath, dirCache);

        for (const { actualPath, expectedPath } of fixes) {
          try {
            await fs.rename(actualPath, expectedPath);
            totalFixes++;
            // Invalidate cache for the parent directory since contents changed
            dirCache.delete(path.dirname(actualPath));
            log.info(`[CaseFix] Renamed ${path.relative(projectDir, actualPath)} → ${path.basename(expectedPath)}`);
          } catch (err: any) {
            log.warn(`[CaseFix] Failed to rename ${actualPath}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      log.warn(`[CaseFix] Error scanning ${projectId}: ${err.message}`);
    }

    return totalFixes;
  }

  private async collectSourceFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(dir, results);
    return results;
  }

  private async walkDir(dir: string, results: string[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!CaseSensitivityService.SKIP_DIRS.has(entry.name)) {
          await this.walkDir(path.join(dir, entry.name), results);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CaseSensitivityService.SOURCE_EXTENSIONS.has(ext)) {
          results.push(path.join(dir, entry.name));
        }
      }
    }
  }

  /**
   * Find imports whose resolved path doesn't exist but a case-insensitive match does.
   * Returns rename operations: { actualPath (on disk), expectedPath (what import wants) }
   */
  private async findMismatches(
    content: string,
    fileDir: string,
    filePath: string,
    dirCache: Map<string, string[]>,
  ): Promise<Array<{ actualPath: string; expectedPath: string }>> {
    const fixes: Array<{ actualPath: string; expectedPath: string }> = [];
    const ext = path.extname(filePath).toLowerCase();
    const isStyleFile = ['.scss', '.sass', '.css', '.less'].includes(ext);

    // Choose regex patterns based on file type
    const patterns: RegExp[] = isStyleFile
      ? [CaseSensitivityService.CSS_IMPORT_REGEX, CaseSensitivityService.CSS_URL_REGEX]
      : [CaseSensitivityService.JS_IMPORT_REGEX];

    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, 'g');
      let match;

      while ((match = regex.exec(content)) !== null) {
        const importPath = match[1];
        const pathFixes = await this.resolveImportMismatch(importPath, fileDir, dirCache);
        for (const fix of pathFixes) {
          if (!fixes.some((f) => f.actualPath === fix.actualPath)) {
            fixes.push(fix);
          }
        }
      }
    }

    return fixes;
  }

  /**
   * Resolve a single import path, checking both file name AND directory name mismatches.
   */
  private async resolveImportMismatch(
    importPath: string,
    fileDir: string,
    dirCache: Map<string, string[]>,
  ): Promise<Array<{ actualPath: string; expectedPath: string }>> {
    const fixes: Array<{ actualPath: string; expectedPath: string }> = [];

    // First: fix directory name mismatches along the path
    const resolved = path.resolve(fileDir, importPath);
    const fixedResolved = await this.fixDirectoryCase(resolved, fileDir, dirCache, fixes);

    const resolvedDir = path.dirname(fixedResolved);
    const resolvedBase = path.basename(fixedResolved);

    // Check if the exact file exists now (after dir fixes)
    if (await this.fileExistsFast(fixedResolved)) return fixes;

    // Check with common extensions for extensionless imports
    const ext = path.extname(resolvedBase);
    if (!ext) {
      const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.scss', '.sass', '.css', '.json'];
      for (const tryExt of extensions) {
        if (await this.fileExistsFast(fixedResolved + tryExt)) return fixes;
      }
      // Also check for index files: ./utils → ./utils/index.ts
      if (await this.fileExistsFast(path.join(fixedResolved, 'index.ts'))
        || await this.fileExistsFast(path.join(fixedResolved, 'index.js'))
        || await this.fileExistsFast(path.join(fixedResolved, 'index.tsx'))
        || await this.fileExistsFast(path.join(fixedResolved, 'index.jsx'))) {
        return fixes;
      }
    }

    // File doesn't exist — look for case-insensitive file name match
    const dirEntries = await this.getDirEntries(resolvedDir, dirCache);
    if (!dirEntries) return fixes;

    const lowerBase = resolvedBase.toLowerCase();
    const caseMatch = dirEntries.find(
      (e) => e.toLowerCase() === lowerBase && e !== resolvedBase,
    );

    if (caseMatch) {
      fixes.push({
        actualPath: path.join(resolvedDir, caseMatch),
        expectedPath: path.join(resolvedDir, resolvedBase),
      });
    }

    // For extensionless imports, check with extensions too
    if (!ext) {
      const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.scss', '.sass', '.css'];
      for (const tryExt of extensions) {
        const withExt = resolvedBase + tryExt;
        const lowerWithExt = withExt.toLowerCase();
        const extMatch = dirEntries.find(
          (e) => e.toLowerCase() === lowerWithExt && e !== withExt,
        );
        if (extMatch) {
          if (!fixes.some((f) => f.actualPath === path.join(resolvedDir, extMatch))) {
            fixes.push({
              actualPath: path.join(resolvedDir, extMatch),
              expectedPath: path.join(resolvedDir, withExt),
            });
          }
          break;
        }
      }
    }

    return fixes;
  }

  /**
   * Walk each segment of an import path and fix directory name case mismatches.
   * e.g. import from "./Components/Button" when dir is "components" on disk.
   */
  private async fixDirectoryCase(
    targetPath: string,
    baseDir: string,
    dirCache: Map<string, string[]>,
    fixes: Array<{ actualPath: string; expectedPath: string }>,
  ): Promise<string> {
    // Get the relative path from baseDir
    const rel = path.relative(baseDir, targetPath);
    const segments = rel.split(path.sep);
    if (segments.length <= 1) return targetPath; // no directory component to fix

    let current = baseDir;
    const fixedSegments: string[] = [];

    // Check each directory segment (skip the last one — that's the file)
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      if (segment === '..') {
        current = path.dirname(current);
        fixedSegments.push(segment);
        continue;
      }
      if (segment === '.') {
        fixedSegments.push(segment);
        continue;
      }

      const expectedDir = path.join(current, segment);
      if (await this.fileExistsFast(expectedDir)) {
        current = expectedDir;
        fixedSegments.push(segment);
        continue;
      }

      // Directory doesn't exist with this case — find case-insensitive match
      const parentEntries = await this.getDirEntries(current, dirCache);
      if (!parentEntries) {
        fixedSegments.push(segment);
        current = expectedDir;
        continue;
      }

      const lowerSeg = segment.toLowerCase();
      const dirMatch = parentEntries.find(
        (e) => e.toLowerCase() === lowerSeg && e !== segment,
      );

      if (dirMatch) {
        const actualDir = path.join(current, dirMatch);
        fixes.push({ actualPath: actualDir, expectedPath: expectedDir });
        current = expectedDir; // after rename, this will be the correct path
        fixedSegments.push(segment);
      } else {
        current = expectedDir;
        fixedSegments.push(segment);
      }
    }

    // Reconstruct path with last segment (filename)
    fixedSegments.push(segments[segments.length - 1]);
    return path.join(baseDir, ...fixedSegments);
  }

  private async fileExistsFast(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async getDirEntries(
    dir: string,
    cache: Map<string, string[]>,
  ): Promise<string[] | null> {
    const cached = cache.get(dir);
    if (cached) return cached;

    try {
      const entries = await fs.readdir(dir);
      cache.set(dir, entries);
      return entries;
    } catch {
      return null;
    }
  }
}

export const caseSensitivityService = new CaseSensitivityService();
