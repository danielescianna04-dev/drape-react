import { execShell } from '../utils/helpers';
import path from 'path';
import { config } from '../config';

/**
 * Search for text patterns in files using grep
 * @param projectId - The project ID
 * @param pattern - Text pattern to search for (supports regex)
 * @param searchPath - Optional base path to search from (relative to project root)
 * @param include - Optional file pattern to include (e.g., "*.ts")
 * @returns Formatted string with matching lines
 */
export async function grepSearch(
  projectId: string,
  pattern: string,
  searchPath?: string,
  include?: string
): Promise<string> {
  try {
    const root = path.join(config.projectsRoot, projectId, searchPath || '');

    // Escape quotes in the pattern
    const escapedPattern = pattern.replace(/"/g, '\\"');

    // Build grep command with exclusions
    let cmd = 'grep -rn';

    // Add include pattern if specified
    if (include) {
      cmd += ` --include='${include}'`;
    } else {
      cmd += ` --include='*'`;
    }

    // Exclude common directories
    cmd += ' --exclude-dir=node_modules';
    cmd += ' --exclude-dir=.git';
    cmd += ' --exclude-dir=.next';
    cmd += ' --exclude-dir=dist';
    cmd += ' --exclude-dir=build';
    cmd += ' --exclude-dir=.cache';

    // Add pattern and path
    cmd += ` "${escapedPattern}" "${root}" 2>/dev/null | head -50`;

    const result = await execShell(cmd, root, 15000);

    if (!result.stdout.trim()) {
      return `No matches found for pattern: ${pattern}`;
    }

    // Strip absolute path prefix for readability
    const output = result.stdout.replace(new RegExp(root + '/', 'g'), '');

    // Count matches
    const lineCount = output.split('\n').filter(l => l.trim()).length;
    const header = `Found ${lineCount} match(es) for pattern: ${pattern}\n\n`;

    return header + output;
  } catch (error: any) {
    return `Error searching files: ${error.message}`;
  }
}
