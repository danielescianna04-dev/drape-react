/**
 * TodoWrite Tool - Task list management
 * Based on Claude Code's TodoWrite tool specification
 */

/**
 * Update the current task list
 * @param {Array} todos - Array of todo objects
 * @returns {Object} Updated todo list payload
 */
function todoWrite(todos) {
    // Validate todos
    if (!Array.isArray(todos)) {
        throw new Error('Todos must be an array');
    }

    // Validate each todo
    todos.forEach((todo, i) => {
        if (!todo.content || !todo.status || !todo.activeForm) {
            throw new Error(`Todo ${i + 1} is missing required fields (content, status, activeForm)`);
        }

        if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
            throw new Error(`Todo ${i + 1} has invalid status: ${todo.status}`);
        }

        if (!todo.content.trim()) {
            throw new Error(`Todo ${i + 1} has empty content`);
        }

        if (!todo.activeForm.trim()) {
            throw new Error(`Todo ${i + 1} has empty activeForm`);
        }
    });

    // Validate state: exactly one in_progress at a time
    const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
        throw new Error('Only one todo can be in_progress at a time');
    }

    // Return the todo list payload for SSE streaming
    return {
        success: true,
        type: 'todo_update',
        todos,
        timestamp: new Date().toISOString()
    };
}

module.exports = { todoWrite };
