import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger';

// Track failed auth attempts per IP
const failedAuthAttempts = new Map<string, { count: number; firstAttempt: number }>();
// Track request counts per user for anomaly detection
const userRequestCounts = new Map<string, { count: number; windowStart: number }>();

const FAILED_AUTH_THRESHOLD = 10; // Max failed auth attempts before alerting
const FAILED_AUTH_WINDOW = 5 * 60 * 1000; // 5 minutes
const ANOMALY_THRESHOLD = 200; // Max requests per user per window
const ANOMALY_WINDOW = 60 * 1000; // 1 minute

function cleanupOldEntries() {
  const now = Date.now();
  for (const [ip, data] of failedAuthAttempts.entries()) {
    if (now - data.firstAttempt > FAILED_AUTH_WINDOW) {
      failedAuthAttempts.delete(ip);
    }
  }
  for (const [user, data] of userRequestCounts.entries()) {
    if (now - data.windowStart > ANOMALY_WINDOW) {
      userRequestCounts.delete(user);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldEntries, 5 * 60 * 1000);

export function securityMonitor(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userId = (req as any).userId;
  const path = req.path;
  const method = req.method;

  // Track per-user request volume
  if (userId) {
    const now = Date.now();
    const userStats = userRequestCounts.get(userId);
    if (!userStats || now - userStats.windowStart > ANOMALY_WINDOW) {
      userRequestCounts.set(userId, { count: 1, windowStart: now });
    } else {
      userStats.count++;
      if (userStats.count === ANOMALY_THRESHOLD) {
        log.warn(`[SECURITY] Anomalous request volume from user ${userId}: ${userStats.count} requests in ${ANOMALY_WINDOW / 1000}s from IP ${ip}`);
      }
    }
  }

  // Log sensitive endpoint access
  const sensitivePatterns = ['/env', '/exec', '/execute-command', '/delete', '/publish'];
  if (sensitivePatterns.some(p => path.includes(p))) {
    log.info(`[SECURITY] Sensitive endpoint accessed: ${method} ${path} by user=${userId || 'anonymous'} ip=${ip}`);
  }

  // Intercept response to track failed auth
  const originalEnd = res.end;
  res.end = function(this: Response, ...args: any[]) {
    if (res.statusCode === 401 || res.statusCode === 403) {
      const attempts = failedAuthAttempts.get(ip);
      if (!attempts) {
        failedAuthAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
      } else {
        attempts.count++;
        if (attempts.count === FAILED_AUTH_THRESHOLD) {
          log.warn(`[SECURITY] Brute force detected from IP ${ip}: ${attempts.count} failed auth attempts in ${FAILED_AUTH_WINDOW / 1000}s`);
        }
      }
    }
    return originalEnd.apply(this, args as any);
  } as any;

  next();
}
