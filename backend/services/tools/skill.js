/**
 * Skill Tool
 * Execute a skill within the conversation (slash commands)
 * Based on Claude Code's Skill tool specification
 */

const skills = {
    'commit': {
        name: 'commit',
        description: 'Create a git commit with changes',
        handler: async (args) => {
            // This will trigger the git commit flow in the agent
            return {
                success: true,
                skill: 'commit',
                action: 'prepare_commit',
                args
            };
        }
    },
    'review-pr': {
        name: 'review-pr',
        description: 'Review a pull request',
        handler: async (args) => {
            return {
                success: true,
                skill: 'review-pr',
                action: 'review_pull_request',
                prNumber: args
            };
        }
    },
    'pdf': {
        name: 'pdf',
        description: 'Work with PDF files',
        handler: async (args) => {
            return {
                success: true,
                skill: 'pdf',
                action: 'process_pdf',
                args
            };
        }
    }
};

/**
 * Execute a skill (slash command)
 * @param {string} skill - Skill name (e.g., "commit", "review-pr", "pdf")
 * @param {string} args - Optional arguments for the skill
 * @returns {Promise<Object>} Skill execution result
 */
async function executeSkill(skill, args = '') {
    if (!skills[skill]) {
        return {
            success: false,
            error: `Unknown skill: ${skill}. Available skills: ${Object.keys(skills).join(', ')}`
        };
    }

    try {
        const result = await skills[skill].handler(args);
        return result;
    } catch (error) {
        return {
            success: false,
            error: error.message,
            skill
        };
    }
}

/**
 * Get list of available skills
 * @returns {Object[]} List of skills with descriptions
 */
function listSkills() {
    return Object.values(skills).map(s => ({
        name: s.name,
        description: s.description
    }));
}

module.exports = { executeSkill, listSkills };
