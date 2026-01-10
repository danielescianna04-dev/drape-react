/**
 * Grep Tool - Powerful content search using ripgrep
 * Based on Claude Code's Grep tool specification
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const { IGNORED_DIRS, TEXT_EXTENSIONS } = require('../../utils/constants');

const execAsync = promisify(exec);

/**
 * Search file contents using ripgrep
 * @param {string} pattern - Regex pattern to search for
 * @param {Object} options - Search options
 * @param {string} options.searchPath - Directory to search in
 * @param {string} options.glob - Glob pattern to filter files
 * @param {string} options.type - File type filter (js, py, etc.)
 * @param {string} options.outputMode - 'content', 'files_with_matches', or 'count'
 * @param {boolean} options.caseInsensitive - Case insensitive search
 * @param {number} options.contextBefore - Lines before match
 * @param {number} options.contextAfter - Lines after match
 * @param {number} options.contextAround - Lines around match
 * @param {boolean} options.showLineNumbers - Show line numbers
 * @param {number} options.headLimit - Limit results
 * @param {number} options.offset - Skip first N results
 * @param {boolean} options.multiline - Enable multiline matching
 * @returns {Promise<{results: Array, count: number}>}
 */
async function grepSearch(pattern, options = {}) {
    const {
        searchPath = '.',
        glob: globPattern,
        type,
        outputMode = 'files_with_matches',
        caseInsensitive = false,
        contextBefore,
        contextAfter,
        contextAround,
        showLineNumbers = true,
        headLimit = 0,
        offset = 0,
        multiline = false
    } = options;

    try {
        // Build ripgrep command
        const rgArgs = ['rg'];

        // Pattern
        rgArgs.push(pattern);

        // Case sensitivity
        if (caseInsensitive) {
            rgArgs.push('-i');
        }

        // Output mode
        if (outputMode === 'files_with_matches') {
            rgArgs.push('-l'); // List files with matches
        } else if (outputMode === 'count') {
            rgArgs.push('-c'); // Count matches per file
        }
        // 'content' mode is default

        // Line numbers
        if (outputMode === 'content' && showLineNumbers) {
            rgArgs.push('-n');
        }

        // Context lines
        if (outputMode === 'content') {
            if (contextAround) {
                rgArgs.push(`-C${contextAround}`);
            } else {
                if (contextBefore) rgArgs.push(`-B${contextBefore}`);
                if (contextAfter) rgArgs.push(`-A${contextAfter}`);
            }
        }

        // Multiline
        if (multiline) {
            rgArgs.push('-U', '--multiline-dotall');
        }

        // Glob pattern
        if (globPattern) {
            rgArgs.push('--glob', globPattern);
        }

        // Type filter
        if (type) {
            rgArgs.push('-t', type);
        }

        // Ignore directories
        IGNORED_DIRS.forEach(dir => {
            rgArgs.push('--glob', `!${dir}/**`);
        });

        // Search path
        rgArgs.push(searchPath);

        // Execute ripgrep
        const { stdout, stderr } = await execAsync(rgArgs.join(' '), {
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            cwd: process.cwd()
        });

        // Parse results based on output mode
        let results = [];
        const lines = stdout.trim().split('\n').filter(Boolean);

        if (outputMode === 'files_with_matches') {
            results = lines;
        } else if (outputMode === 'count') {
            results = lines.map(line => {
                const [file, count] = line.split(':');
                return { file, count: parseInt(count, 10) };
            });
        } else {
            // content mode
            results = lines;
        }

        // Apply offset and limit
        if (offset > 0) {
            results = results.slice(offset);
        }
        if (headLimit > 0) {
            results = results.slice(0, headLimit);
        }

        return {
            results,
            count: results.length
        };
    } catch (error) {
        // ripgrep exits with code 1 when no matches found
        if (error.code === 1) {
            return { results: [], count: 0 };
        }
        throw new Error(`Grep search failed: ${error.message}`);
    }
}

module.exports = { grepSearch };
