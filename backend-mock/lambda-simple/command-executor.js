// Command Executor - Business Logic Estratta per Lambda
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class CommandExecutor {
  constructor() {
    this.blockedPatterns = [
      /rm\s+-rf\s+\//, // Prevent rm -rf /
      /dd\s+if=/, // Prevent disk operations
      /mkfs/, // Prevent filesystem operations  
      /mount/, // Prevent mounting
      /umount/, // Prevent unmounting
      /passwd/, // Prevent password changes
      /su\s/, // Prevent user switching
      /sudo/, // Prevent sudo
      /kill\s+-9/, // Prevent killing system processes
      /shutdown/, // Prevent shutdown
      /reboot/, // Prevent reboot
      /curl.*\/etc\/shadow/, // Prevent accessing system files
      /cat.*\/etc\/passwd/, // Prevent accessing system files
      /\.\.\//g // Prevent directory traversal
    ];
  }

  isCommandBlocked(command) {
    return this.blockedPatterns.some(pattern => pattern.test(command));
  }

  async executeCommand(command, session, streaming = true, onOutput = null) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      console.log(`🔧 [${session.userId}] Executing: ${command}`);

      // Security checks
      if (this.isCommandBlocked(command)) {
        return resolve({
          success: false,
          output: `🚫 Command blocked for security: ${command}`,
          executionTime: Date.now() - startTime
        });
      }

      // Handle special commands
      if (command.startsWith('cd ')) {
        return this.handleCdCommand(command, session, startTime, resolve);
      }

      if (command === '/quota') {
        return this.handleQuotaCommand(session, resolve, startTime);
      }

      // Execute regular commands with timeout
      const child = spawn('bash', ['-c', command], {
        cwd: session.workspaceDir,
        env: { 
          ...process.env,
          HOME: session.workspaceDir, // Isolate home directory
          WARP_SESSION: session.sessionId,
          WARP_USER: session.userId,
          PATH: process.env.PATH,
          WARP_JAIL: session.workspaceDir // Security jail
        },
        timeout: session.processTimeout
      });

      let output = '';
      let errorOutput = '';
      let killed = false;

      // Force kill after timeout
      const killTimer = setTimeout(() => {
        if (!killed) {
          killed = true;
          child.kill('SIGKILL');
          resolve({
            success: false,
            output: `❌ Command timeout (${session.processTimeout/1000}s max)`,
            executionTime: Date.now() - startTime
          });
        }
      }, session.processTimeout);

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        
        // Stream output callback
        if (streaming && onOutput && !killed) {
          onOutput({
            type: 'stdout',
            data: chunk,
            timestamp: Date.now()
          });
        }
      });

      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput += chunk;
        
        if (streaming && onOutput && !killed) {
          onOutput({
            type: 'stderr', 
            data: chunk,
            timestamp: Date.now()
          });
        }
      });

      child.on('close', (code) => {
        if (killed) return; // Already handled by timeout
        
        clearTimeout(killTimer);
        const executionTime = Date.now() - startTime;
        const success = code === 0;
        
        console.log(`${success ? '✅' : '❌'} [${session.userId}] Command ${success ? 'completed' : 'failed'} in ${executionTime}ms`);
        
        resolve({
          success,
          output: success ? output : errorOutput,
          exitCode: code,
          executionTime,
          workingDir: session.workspaceDir
        });
      });

      child.on('error', (error) => {
        if (killed) return;
        
        clearTimeout(killTimer);
        console.error(`[${session.userId}] Command execution error:`, error);
        resolve({
          success: false,
          output: `❌ Execution failed: ${error.message}`,
          executionTime: Date.now() - startTime
        });
      });
    });
  }

  async handleCdCommand(command, session, startTime, resolve) {
    const newDir = command.substring(3).trim();
    let targetDir;

    if (newDir === '~' || newDir === '') {
      targetDir = session.workspaceDir; // Home is user workspace
    } else if (newDir.startsWith('/')) {
      // Absolute path - restrict to user workspace
      targetDir = path.join(session.workspaceDir, newDir.substring(1));
    } else {
      // Relative path
      targetDir = path.resolve(session.workspaceDir, newDir);
    }

    // Security: ensure we stay within user workspace
    if (!targetDir.startsWith(session.workspaceDir)) {
      return resolve({
        success: false,
        output: `🚫 Access denied: Cannot leave your workspace\\nYour workspace: ${session.workspaceDir}`,
        executionTime: Date.now() - startTime
      });
    }

    try {
      await fs.access(targetDir);
      // Update session working directory
      session.currentDir = targetDir;
      resolve({
        success: true,
        output: `Changed directory to: ${targetDir.replace(session.workspaceDir, '~')}`,
        executionTime: Date.now() - startTime
      });
    } catch (error) {
      resolve({
        success: false,
        output: `Directory not found: ${newDir}`,
        executionTime: Date.now() - startTime
      });
    }
  }

  async handleQuotaCommand(session, resolve, startTime) {
    // This will need UserManager instance in Lambda
    // For now, return placeholder
    resolve({
      success: true,
      output: `📊 Storage Quota for ${session.userId}:\\n\\n` +
              `Quota: ${Math.round(session.fileQuota / 1024 / 1024)} MB\\n` +
              `Use /quota with UserManager for detailed stats`,
      executionTime: Date.now() - startTime
    });
  }

  // File operations
  async readFile(filePath, session) {
    const fullPath = path.resolve(session.workspaceDir, filePath);
    
    // Security check
    if (!fullPath.startsWith(session.workspaceDir)) {
      throw new Error('Access denied: Cannot read files outside workspace');
    }

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      return { success: true, content };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async writeFile(filePath, content, session) {
    const fullPath = path.resolve(session.workspaceDir, filePath);
    
    // Security check
    if (!fullPath.startsWith(session.workspaceDir)) {
      throw new Error('Access denied: Cannot write files outside workspace');
    }

    try {
      await fs.writeFile(fullPath, content, 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async listFiles(dirPath, session) {
    const fullPath = path.resolve(session.workspaceDir, dirPath || '.');
    
    // Security check
    if (!fullPath.startsWith(session.workspaceDir)) {
      throw new Error('Access denied: Cannot list files outside workspace');
    }

    try {
      const files = await fs.readdir(fullPath, { withFileTypes: true });
      const fileList = files.map(file => ({
        name: file.name,
        isDirectory: file.isDirectory(),
        isFile: file.isFile()
      }));
      return { success: true, files: fileList };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = CommandExecutor;