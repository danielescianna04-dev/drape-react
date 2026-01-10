/**
 * MCP IDE getDiagnostics Tool
 * Get language diagnostics from VS Code or IDE
 * Based on Claude Code's mcp__ide__getDiagnostics tool specification
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Get IDE diagnostics (errors, warnings, etc.) for a file or all files
 * @param {string} uri - Optional file URI to get diagnostics for
 * @returns {Promise<Object>} Diagnostics information
 */
async function getIDEDiagnostics(uri = null) {
    try {
        // TODO: Integrate with actual IDE/LSP server
        // For now, return placeholder diagnostics

        // In a real implementation, this would:
        // 1. Connect to Language Server Protocol (LSP) server
        // 2. Request diagnostics for the file or workspace
        // 3. Return formatted diagnostics

        if (!process.env.LSP_SERVER_URL) {
            return {
                success: false,
                error: 'IDE diagnostics requires LSP server integration. Set LSP_SERVER_URL environment variable.',
                diagnostics: []
            };
        }

        // Placeholder response
        return {
            success: true,
            uri: uri || 'workspace',
            diagnostics: [
                // Example diagnostic format
                // {
                //     severity: 'error' | 'warning' | 'info' | 'hint',
                //     message: 'Error message',
                //     range: {
                //         start: { line: 0, character: 0 },
                //         end: { line: 0, character: 10 }
                //     },
                //     source: 'typescript' | 'eslint' | etc,
                //     code: 'TS2304'
                // }
            ],
            count: 0
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            diagnostics: []
        };
    }
}

/**
 * Format diagnostics for display
 * @param {Array} diagnostics - List of diagnostic objects
 * @returns {string} Formatted diagnostics text
 */
function formatDiagnostics(diagnostics) {
    if (!diagnostics || diagnostics.length === 0) {
        return 'No diagnostics found';
    }

    let output = `Found ${diagnostics.length} diagnostic(s):\n\n`;

    diagnostics.forEach((diag, index) => {
        const severity = diag.severity.toUpperCase();
        const location = `Line ${diag.range.start.line + 1}, Column ${diag.range.start.character + 1}`;
        output += `${index + 1}. [${severity}] ${location}\n`;
        output += `   ${diag.message}\n`;
        if (diag.code) {
            output += `   Code: ${diag.code}\n`;
        }
        output += '\n';
    });

    return output;
}

module.exports = { getIDEDiagnostics, formatDiagnostics };
