import fg from 'fast-glob';
import path from 'path';
import { config } from '../config';

/**
 * Search for files matching a glob pattern
 * @param projectId - The project ID
 * @param pattern - Glob pattern (e.g., "**\/*.ts", "src/**\/*.json")
 * @param searchPath - Optional base path to search from (relative to project root)
 * @returns Formatted string with matching file paths
 */
export async function globSearch(
  projectId: string,
  pattern: string,
  searchPath?: string
): Promise<string> {
  try {
    const root = path.join(config.projectsRoot, projectId, searchPath || '');

    const results = await fg(pattern, {
      cwd: root,
      ignore: ['node_modules/**', '.git/**', '.next/**', 'dist/**', 'build/**', '.cache/**'],
      dot: true,
      onlyFiles: true,
      absolute: false,
    });

    if (results.length === 0) {
      return `No files found matching pattern: ${pattern}`;
    }

    // Limit to first 100 results to avoid overwhelming output
    const displayResults = results.slice(0, 100);
    const truncated = results.length > 100;

    let output = `Found ${results.length} file(s) matching pattern: ${pattern}\n\n`;
    output += displayResults.join('\n');

    if (truncated) {
      output += `\n\n(Showing first 100 of ${results.length} results)`;
    }

    return output;
  } catch (error: any) {
    return `Error searching files: ${error.message}`;
  }
}
