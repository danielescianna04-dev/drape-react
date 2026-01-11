/**
 * Unified System Prompt - Claude Code Official
 * Used by BOTH agent mode and normal AI chat
 */

const fs = require('fs');
const path = require('path');

// Load Claude Code system prompt (single source of truth)
const CLAUDE_CODE_PROMPT = fs.readFileSync(
    path.join(__dirname, 'claude-code-system-prompt.txt'),
    'utf-8'
);

/**
 * Get the system prompt with optional project context
 * @param {Object} options - Optional context to append
 * @returns {string} - Complete system prompt
 */
function getSystemPrompt(options = {}) {
    let systemPrompt = CLAUDE_CODE_PROMPT;

    // Add project context if provided (string or object)
    if (options.projectContext) {
        if (typeof options.projectContext === 'string') {
            systemPrompt += `\n\n# Project Context\n${options.projectContext}`;
        } else {
            // Structured project context
            systemPrompt += `\n\n# Current Project Context\n`;
            if (options.projectContext.projectName) {
                systemPrompt += `- Project Name: ${options.projectContext.projectName}\n`;
            }
            if (options.projectContext.language) {
                systemPrompt += `- Primary Language: ${options.projectContext.language}\n`;

                // Add language-specific instructions
                const language = options.projectContext.language.toLowerCase();
                if (language.includes('react') || language.includes('javascript') || language.includes('typescript')) {
                    systemPrompt += `\n**IMPORTANT**: This is a React/JavaScript project. When the user asks you to modify the UI or create pages:\n`;
                    systemPrompt += `- Modify existing .jsx/.tsx files (like src/App.jsx, src/pages/Home.jsx)\n`;
                    systemPrompt += `- DO NOT create separate HTML files - use React components\n`;
                    systemPrompt += `- Use JSX syntax with inline styles or CSS modules\n`;
                } else if (language.includes('python')) {
                    systemPrompt += `\n**IMPORTANT**: This is a Python project.\n`;
                } else if (language.includes('html')) {
                    systemPrompt += `\n**IMPORTANT**: This is an HTML/CSS project. Modify index.html and style.css files.\n`;
                }
            }
            if (options.projectContext.repositoryUrl) {
                systemPrompt += `- Repository: ${options.projectContext.repositoryUrl}\n`;
            }
        }
    }

    // Add file list if provided
    if (options.projectFiles && options.projectFiles.length > 0) {
        systemPrompt += `\n\n# Project Files (${options.projectFiles.length} files)\n`;
        for (const file of options.projectFiles) {
            systemPrompt += `- ${file.path}${file.size ? ` (${file.size} bytes)` : ''}\n`;
        }
    }

    // Add key file contents if provided
    if (options.keyFilesContent && Object.keys(options.keyFilesContent).length > 0) {
        systemPrompt += `\n\n# Key Project Files Content\n`;
        for (const [filePath, content] of Object.entries(options.keyFilesContent)) {
            const ext = filePath.split('.').pop();
            systemPrompt += `\n--- ${filePath} ---\n\`\`\`${ext}\n${content}\n\`\`\`\n`;
        }
    }

    return systemPrompt;
}

module.exports = {
    getSystemPrompt,
    CLAUDE_CODE_PROMPT
};
