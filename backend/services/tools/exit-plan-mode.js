/**
 * ExitPlanMode Tool
 * Signals that the plan is complete and ready for user approval
 * Based on Claude Code's ExitPlanMode tool specification
 */

/**
 * Exit plan mode - submits plan for user approval
 * @param {Object} plan - The plan object with title, steps, etc.
 * @returns {Object} Result with plan ready for approval
 */
function exitPlanMode(plan) {
    if (!plan || !plan.title || !plan.steps) {
        return {
            success: false,
            error: 'Plan must include title and steps'
        };
    }

    return {
        success: true,
        planReady: true,
        plan: {
            title: plan.title,
            steps: plan.steps,
            estimated_files: plan.estimated_files || plan.steps.length,
            technologies: plan.technologies || []
        },
        message: 'Plan is ready for user approval'
    };
}

module.exports = { exitPlanMode };
