/**
 * KillShell Tool
 * Kills a running background bash shell by its ID
 * Based on Claude Code's KillShell tool specification
 */

// In-memory storage for background shells
const backgroundShells = new Map();

/**
 * Kill a running background shell
 * @param {string} shell_id - ID of the background shell to kill
 * @returns {Object} Result indicating success or failure
 */
function killShell(shell_id) {
    if (!backgroundShells.has(shell_id)) {
        return {
            success: false,
            error: `Shell ${shell_id} not found. Use /tasks command to see active shells.`
        };
    }

    const shell = backgroundShells.get(shell_id);

    try {
        // Kill the process
        if (shell.process && !shell.process.killed) {
            shell.process.kill('SIGTERM');

            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (!shell.process.killed) {
                    shell.process.kill('SIGKILL');
                }
            }, 5000);
        }

        backgroundShells.delete(shell_id);

        return {
            success: true,
            shell_id,
            message: `Shell ${shell_id} terminated`
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            shell_id
        };
    }
}

/**
 * Register a background shell
 * @param {string} shell_id - Unique shell ID
 * @param {Object} process - Child process object
 * @param {Object} metadata - Additional metadata
 */
function registerBackgroundShell(shell_id, process, metadata = {}) {
    backgroundShells.set(shell_id, {
        shell_id,
        process,
        metadata,
        startTime: Date.now()
    });
}

/**
 * Get list of active background shells
 * @returns {Array} List of active shells
 */
function listBackgroundShells() {
    return Array.from(backgroundShells.values()).map(shell => ({
        shell_id: shell.shell_id,
        running: shell.process && !shell.process.killed,
        uptime: Date.now() - shell.startTime,
        metadata: shell.metadata
    }));
}

module.exports = {
    killShell,
    registerBackgroundShell,
    listBackgroundShells,
    backgroundShells
};
