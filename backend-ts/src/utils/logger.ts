type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  id: number;
  timestamp: string;
  level: LogLevel;
  message: string;
}

type LogListener = (entry: LogEntry) => void;

class Logger {
  private seq = 0;
  private buffer: LogEntry[] = [];
  private maxBuffer = 2000;
  private listeners = new Set<LogListener>();

  private emit(level: LogLevel, ...args: unknown[]): void {
    const message = args.map(a =>
      typeof a === 'string' ? a : JSON.stringify(a)
    ).join(' ');

    const entry: LogEntry = {
      id: ++this.seq,
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer = this.buffer.slice(-this.maxBuffer);
    }

    for (const listener of this.listeners) {
      try { listener(entry); } catch { /* ignore */ }
    }

    // Also write to stdout/stderr
    const prefix = `[${entry.timestamp.slice(11, 23)}]`;
    if (level === 'error') {
      process.stderr.write(`${prefix} ${message}\n`);
    } else {
      process.stdout.write(`${prefix} ${message}\n`);
    }
  }

  debug(...args: unknown[]): void { this.emit('debug', ...args); }
  info(...args: unknown[]): void { this.emit('info', ...args); }
  warn(...args: unknown[]): void { this.emit('warn', ...args); }
  error(...args: unknown[]): void { this.emit('error', ...args); }

  addListener(fn: LogListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getRecent(count = 100): LogEntry[] {
    return this.buffer.slice(-count);
  }

  getSince(sinceId: number): LogEntry[] {
    const idx = this.buffer.findIndex(e => e.id > sinceId);
    return idx >= 0 ? this.buffer.slice(idx) : [];
  }
}

export const log = new Logger();
export type { LogEntry, LogListener };
