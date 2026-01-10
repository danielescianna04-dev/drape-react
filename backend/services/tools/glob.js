/**
 * Glob Tool - Fast file pattern matching
 * Based on Claude Code's Glob tool specification
 */

const { glob } = require('glob');
const path = require('path');
const fs = require('fs').promises;
const { IGNORED_DIRS } = require('../../utils/constants');

/**
 * Find files matching glob pattern
 * @param {string} pattern - Glob pattern to match files
 * @param {string} searchPath - Directory to search in (defaults to current working directory)
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<{files: string[], count: number}>}
 */
async function globSearch(pattern, searchPath = '.', limit = 100) {
    try {
        const options = {
            cwd: searchPath,
            ignore: IGNORED_DIRS.map(dir => `**/${dir}/**`),
            nodir: true, // Only return files, not directories
        };

        // Find all matching files
        const results = await glob(pattern, options);

        // Get stats for each file and sort by modification time
        const filesWithStats = await Promise.all(
            results.map(async (file) => {
                try {
                    const fullPath = path.join(searchPath, file);
                    const stats = await fs.stat(fullPath);
                    return { file, mtime: stats.mtimeMs };
                } catch (error) {
                    return { file, mtime: 0 };
                }
            })
        );

        // Sort by modification time (most recent first)
        const sortedResults = filesWithStats
            .sort((a, b) => b.mtime - a.mtime)
            .map(item => item.file);

        // Limit results
        const limitedResults = sortedResults.slice(0, limit);

        return {
            files: limitedResults,
            count: limitedResults.length,
            total: sortedResults.length
        };
    } catch (error) {
        throw new Error(`Glob search failed: ${error.message}`);
    }
}

module.exports = { globSearch };
