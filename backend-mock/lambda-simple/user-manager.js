// User Manager - Business Logic Estratta per Lambda
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

class UserManager {
  constructor(efsPath = '/tmp') {
    this.efsPath = efsPath;
    this.sessions = new Map(); // In Lambda sarà DynamoDB
  }

  sanitizeUserId(userId) {
    return userId.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 32);
  }

  async createUserSession(userId) {
    const sanitizedUserId = this.sanitizeUserId(userId);
    const sessionId = uuidv4();
    const userHash = crypto.createHash('sha256').update(sanitizedUserId).digest('hex').substring(0, 12);
    const workspaceDir = path.join(this.efsPath, 'users', userHash);

    const session = {
      userId: sanitizedUserId,
      sessionId,
      userHash,
      workspaceDir,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      fileQuota: 500 * 1024 * 1024, // 500MB
      processTimeout: 120 * 1000, // 2 minutes
    };

    // Create user workspace if not exists
    await this.initializeUserWorkspace(session);
    
    // Store session (in Lambda sarà DynamoDB)
    this.sessions.set(sessionId, session);
    
    return session;
  }

  async initializeUserWorkspace(session) {
    try {
      // Create isolated user workspace
      await fs.mkdir(session.workspaceDir, { recursive: true, mode: 0o700 });
      
      // Set strict permissions
      await fs.chmod(session.workspaceDir, 0o700);
      
      // Create welcome file
      const welcomeContent = `# Welcome ${session.userId} to Warp Mobile AI IDE!

🔒 This is your secure workspace
🤖 AI Agent ready!
📁 Max storage: ${Math.round(session.fileQuota/1024/1024)}MB

## Getting Started
\`\`\`bash
# Try these commands:
ls -la
node --version
/ai "Help me create a simple app"
/agent "Setup a React project"
\`\`\`

**Happy Coding! 🚀**`;

      await fs.writeFile(
        path.join(session.workspaceDir, 'README.md'),
        welcomeContent
      );

      console.log(`✅ Workspace initialized: ${session.workspaceDir}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to initialize workspace:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Update last activity
    session.lastActivity = Date.now();
    return session;
  }

  async checkQuota(session) {
    try {
      const stats = await this.getDirectorySize(session.workspaceDir);
      return {
        used: stats,
        remaining: session.fileQuota - stats,
        percentage: Math.round((stats / session.fileQuota) * 100)
      };
    } catch (error) {
      return { used: 0, remaining: session.fileQuota, percentage: 0 };
    }
  }

  async getDirectorySize(dir) {
    let totalSize = 0;
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist or no permissions
      console.warn('Directory size calculation failed:', error.message);
    }
    return totalSize;
  }

  async cleanupExpiredSessions(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > maxAge) {
        expiredSessions.push(sessionId);
      }
    }

    for (const sessionId of expiredSessions) {
      this.sessions.delete(sessionId);
      console.log(`🗑️ Cleaned up expired session: ${sessionId}`);
    }

    return expiredSessions.length;
  }
}

module.exports = UserManager;