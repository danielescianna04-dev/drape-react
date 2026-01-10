/**
 * TaskOutput Tool
 * Retrieves output from a running or completed task (background shell, agent, or remote session)
 * Based on Claude Code's TaskOutput tool specification
 */

const fs = require('fs').promises;
const path = require('path');
const { backgroundShells } = require('./kill-shell');

// In-memory storage for task outputs
const taskOutputs = new Map();

/**
 * Get output from a task
 * @param {string} task_id - Task ID to get output from
 * @param {boolean} block - Whether to wait for completion (default: true)
 * @param {number} timeout - Max wait time in ms (default: 30000)
 * @returns {Promise<Object>} Task output and status
 */
async function getTaskOutput(task_id, block = true, timeout = 30000) {
    // Check if task exists
    const task = taskOutputs.get(task_id) || backgroundShells.get(task_id);

    if (!task) {
        return {
            success: false,
            error: `Task ${task_id} not found. Use /tasks command to see active tasks.`,
            task_id
        };
    }

    try {
        if (block) {
            // Wait for task completion or timeout
            const startTime = Date.now();
            while (!task.completed && (Date.now() - startTime) < timeout) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (!task.completed) {
                return {
                    success: true,
                    task_id,
                    status: 'running',
                    output: task.output || '',
                    partial: true,
                    message: 'Task still running (timeout reached)'
                };
            }
        }

        return {
            success: true,
            task_id,
            status: task.completed ? 'completed' : 'running',
            output: task.output || '',
            exitCode: task.exitCode,
            error: task.error
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            task_id
        };
    }
}

/**
 * Register a new task
 * @param {string} task_id - Unique task ID
 * @param {Object} options - Task options
 */
function registerTask(task_id, options = {}) {
    taskOutputs.set(task_id, {
        task_id,
        output: '',
        completed: false,
        exitCode: null,
        error: null,
        startTime: Date.now(),
        ...options
    });
}

/**
 * Update task output
 * @param {string} task_id - Task ID
 * @param {string} output - Output to append
 */
function updateTaskOutput(task_id, output) {
    const task = taskOutputs.get(task_id);
    if (task) {
        task.output += output;
    }
}

/**
 * Mark task as completed
 * @param {string} task_id - Task ID
 * @param {number} exitCode - Exit code
 * @param {string} error - Error message if failed
 */
function completeTask(task_id, exitCode = 0, error = null) {
    const task = taskOutputs.get(task_id);
    if (task) {
        task.completed = true;
        task.exitCode = exitCode;
        task.error = error;
    }
}

/**
 * Get list of all tasks
 * @returns {Array} List of tasks
 */
function listTasks() {
    return Array.from(taskOutputs.values()).map(task => ({
        task_id: task.task_id,
        status: task.completed ? 'completed' : 'running',
        uptime: Date.now() - task.startTime,
        hasOutput: task.output.length > 0
    }));
}

module.exports = {
    getTaskOutput,
    registerTask,
    updateTaskOutput,
    completeTask,
    listTasks,
    taskOutputs
};
