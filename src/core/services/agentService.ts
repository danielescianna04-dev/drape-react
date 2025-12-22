/**
 * Agent Service - Direct communication with Drape Agent in workspace
 * Features: Hot Reload, Terminal, AI Context
 */

import { config } from '../../config/config';

// Types
interface FileChange {
    type: 'change' | 'rename';
    file: string;
    timestamp: number;
}

interface TerminalOutput {
    type: 'stdout' | 'stderr';
    data: string;
}

interface ProjectContext {
    files: string[];
    contents: Record<string, string>;
}

/**
 * Build the Agent URL for a workspace
 */
const getAgentUrl = (username: string, workstationId: string): string => {
    // Use configured Coder URL (e.g., http://drape.info)
    const coderBaseUrl = config.coderUrl;
    return `${coderBaseUrl}/@${username.toLowerCase()}/${workstationId}/apps/agent`;
};

/**
 * Hot Reload - File Watcher Service
 * Connects via SSE to get real-time file change notifications
 */
export class FileWatcherService {
    private eventSource: EventSource | null = null;
    private workstationId: string | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    /**
     * Connect to file watcher
     */
    connect(
        workstationId: string,
        username: string,
        onFileChange: (change: FileChange) => void
    ): void {
        // Don't reconnect if already connected
        if (this.workstationId === workstationId && this.eventSource) {
            console.log(`👀 Already watching files for: ${workstationId}`);
            return;
        }

        this.disconnect();
        this.workstationId = workstationId;

        const agentUrl = getAgentUrl(username, workstationId);
        console.log(`👀 [FileWatcher] Connecting to: ${agentUrl}/watch`);

        try {
            // Use XMLHttpRequest for SSE since EventSource may not work with cookies
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `${agentUrl}/watch`);
            xhr.withCredentials = true;

            let lastIndex = 0;

            xhr.onprogress = () => {
                const newData = xhr.responseText.substring(lastIndex);
                lastIndex = xhr.responseText.length;

                if (newData.length > 0) {
                    // Parse SSE events
                    const lines = newData.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const change: FileChange = JSON.parse(line.substring(6));
                                console.log(`👀 [FileWatcher] File changed: ${change.file}`);
                                onFileChange(change);
                            } catch (e) {
                                // Ignore parse errors
                            }
                        }
                    }
                }
            };

            xhr.onerror = () => {
                console.log('👀 [FileWatcher] Connection error, reconnecting in 5s...');
                this.scheduleReconnect(workstationId, username, onFileChange);
            };

            xhr.send();
            (this.eventSource as any) = xhr; // Store for disconnect

        } catch (error) {
            console.error('👀 [FileWatcher] Failed to connect:', error);
        }
    }

    /**
     * Disconnect from file watcher
     */
    disconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.eventSource) {
            console.log(`👀 [FileWatcher] Disconnecting from: ${this.workstationId}`);
            (this.eventSource as any).abort?.();
            this.eventSource = null;
        }
        this.workstationId = null;
    }

    private scheduleReconnect(
        workstationId: string,
        username: string,
        onFileChange: (change: FileChange) => void
    ): void {
        if (this.reconnectTimeout) return;

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (this.workstationId === workstationId) {
                this.connect(workstationId, username, onFileChange);
            }
        }, 5000);
    }
}

/**
 * Terminal Service - Interactive shell via Agent
 */
export class TerminalService {
    private terminalId: string | null = null;
    private pollInterval: NodeJS.Timeout | null = null;

    /**
     * Create a new terminal session
     */
    async create(workstationId: string, username: string): Promise<string> {
        const agentUrl = getAgentUrl(username, workstationId);

        try {
            const response = await fetch(`${agentUrl}/terminal/create`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();
            this.terminalId = data.terminalId;
            console.log(`🖥️ [Terminal] Created session: ${this.terminalId}`);
            return this.terminalId;
        } catch (error) {
            console.error('🖥️ [Terminal] Failed to create:', error);
            throw error;
        }
    }

    /**
     * Send input to terminal
     */
    async sendInput(workstationId: string, username: string, input: string): Promise<void> {
        if (!this.terminalId) throw new Error('No terminal session');

        const agentUrl = getAgentUrl(username, workstationId);

        await fetch(`${agentUrl}/terminal/input`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                terminalId: this.terminalId,
                input: input + '\n'
            })
        });

        console.log(`🖥️ [Terminal] Sent: ${input}`);
    }

    /**
     * Get terminal output (poll-based)
     */
    async getOutput(workstationId: string, username: string): Promise<TerminalOutput[]> {
        if (!this.terminalId) return [];

        const agentUrl = getAgentUrl(username, workstationId);

        try {
            const response = await fetch(`${agentUrl}/terminal/output?id=${this.terminalId}`, {
                credentials: 'include'
            });

            const data = await response.json();
            return data.output || [];
        } catch (error) {
            return [];
        }
    }

    /**
     * Start polling for output
     */
    startPolling(
        workstationId: string,
        username: string,
        onOutput: (output: TerminalOutput[]) => void,
        intervalMs = 300
    ): void {
        this.stopPolling();

        this.pollInterval = setInterval(async () => {
            const output = await this.getOutput(workstationId, username);
            if (output.length > 0) {
                onOutput(output);
            }
        }, intervalMs);
    }

    /**
     * Stop polling
     */
    stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Cleanup terminal
     */
    disconnect(): void {
        this.stopPolling();
        this.terminalId = null;
    }
}

/**
 * AI Context Service - Get full project context for AI
 */
export const aiContextService = {
    /**
     * Get full project context (files + key file contents)
     */
    async getProjectContext(
        workstationId: string,
        userId: string,
        username: string
    ): Promise<ProjectContext> {
        try {
            const response = await fetch(
                `${config.apiUrl}/preview/context/${workstationId}?userId=${userId}&username=${username}`
            );

            const data = await response.json();

            if (data.success) {
                console.log(`🧠 [AIContext] Got ${data.projectContext.files.length} files`);
                return data.projectContext;
            }

            return { files: [], contents: {} };
        } catch (error) {
            console.error('🧠 [AIContext] Failed to get context:', error);
            return { files: [], contents: {} };
        }
    },

    /**
     * Build AI prompt with project context
     */
    buildContextualPrompt(context: ProjectContext, userMessage: string): string {
        const filesSection = context.files.length > 0
            ? `Project files:\n${context.files.slice(0, 30).join('\n')}\n\n`
            : '';

        const contentsSection = Object.keys(context.contents).length > 0
            ? `Key files content:\n${Object.entries(context.contents)
                .map(([file, content]) => `--- ${file} ---\n${content}`)
                .join('\n\n')}\n\n`
            : '';

        return `${filesSection}${contentsSection}User question: ${userMessage}`;
    }
};

// Export singleton instances
export const fileWatcherService = new FileWatcherService();
export const terminalService = new TerminalService();
