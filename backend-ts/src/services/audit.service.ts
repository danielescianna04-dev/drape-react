import { log } from '../utils/logger';
import fs from 'fs';

interface AuditEntry {
  timestamp: string;
  userId: string;
  action: string;
  resource: string;
  details?: string;
  ip?: string;
}

class AuditService {
  private logPath: string;
  private stream: fs.WriteStream | null = null;

  constructor() {
    this.logPath = process.env.AUDIT_LOG_PATH || '/var/log/drape-audit.jsonl';
    try {
      this.stream = fs.createWriteStream(this.logPath, { flags: 'a' });
      this.stream.on('error', () => {
        this.stream = null;
      });
    } catch {
      this.stream = null;
    }
  }

  async log(entry: Omit<AuditEntry, 'timestamp'>): Promise<void> {
    const full: AuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    const line = JSON.stringify(full) + '\n';

    if (this.stream) {
      this.stream.write(line);
    } else {
      // Fallback to application log
      log.info(`[AUDIT] ${JSON.stringify(full)}`);
    }
  }
}

export const auditService = new AuditService();
