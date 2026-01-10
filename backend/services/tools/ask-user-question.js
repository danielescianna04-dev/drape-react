/**
 * AskUserQuestion Tool - Interactive user questions during execution
 * Based on Claude Code's AskUserQuestion tool specification
 */

/**
 * Ask user a question with multiple choice options
 * @param {Array} questions - Array of question objects
 * @param {Object} userAnswers - Answers provided by user (populated by frontend)
 * @returns {Promise<Object>} User answers
 */
async function askUserQuestion(questions, userAnswers = {}) {
    // Validate questions
    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Questions must be a non-empty array');
    }

    if (questions.length > 4) {
        throw new Error('Maximum 4 questions allowed per call');
    }

    // Validate each question
    questions.forEach((q, i) => {
        if (!q.question || !q.header || !Array.isArray(q.options)) {
            throw new Error(`Question ${i + 1} is missing required fields`);
        }

        if (q.header.length > 12) {
            throw new Error(`Question ${i + 1} header too long (max 12 chars)`);
        }

        if (q.options.length < 2 || q.options.length > 4) {
            throw new Error(`Question ${i + 1} must have 2-4 options`);
        }

        q.options.forEach((opt, j) => {
            if (!opt.label || !opt.description) {
                throw new Error(`Question ${i + 1}, option ${j + 1} missing label or description`);
            }
        });
    });

    // Return the question payload for SSE streaming
    // The agent loop will handle sending this and waiting for response
    return {
        type: 'ask_user_question',
        questions,
        userAnswers,
        timestamp: new Date().toISOString()
    };
}

module.exports = { askUserQuestion };
