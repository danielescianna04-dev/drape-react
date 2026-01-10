/**
 * EnterPlanMode Tool
 * Transitions the agent into plan mode for designing implementation approaches
 * Based on Claude Code's EnterPlanMode tool specification
 */

/**
 * Enter plan mode - requires user approval
 * @returns {Object} Result indicating plan mode entry
 */
function enterPlanMode() {
    return {
        success: true,
        message: 'Entering plan mode. I will design an implementation approach for your approval.',
        mode: 'planning',
        requiresApproval: true
    };
}

module.exports = { enterPlanMode };
