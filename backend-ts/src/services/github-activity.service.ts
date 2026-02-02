import { firebaseService } from './firebase.service';
import { notificationService } from './notification.service';
import { log } from '../utils/logger';

interface GitHubNotification {
  id: string;
  subject: {
    title: string;
    type: string;
    url: string;
  };
  repository: {
    full_name: string;
    owner: {
      login: string;
    };
  };
  reason: string;
  unread: boolean;
  updated_at: string;
}

class GitHubActivityService {
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastCheck = new Map<string, string>(); // userId → ISO date

  /**
   * Start the GitHub activity monitor
   */
  start(intervalMs = 300000): void {
    if (this.checkInterval) {
      log.warn('[GitHub] Activity monitor already running');
      return;
    }

    // Check every 5 minutes by default
    this.checkInterval = setInterval(() => {
      this.checkAndNotify().catch(e => {
        log.error('[GitHub] Check failed:', e.message);
      });
    }, intervalMs);

    log.info(`[GitHub] Activity monitor started (interval: ${intervalMs}ms)`);

    // Run initial check
    this.checkAndNotify().catch(e => {
      log.error('[GitHub] Initial check failed:', e.message);
    });
  }

  /**
   * Stop the GitHub activity monitor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      log.info('[GitHub] Activity monitor stopped');
    }
  }

  /**
   * Check for GitHub activity and send notifications
   */
  private async checkAndNotify(): Promise<void> {
    const db = firebaseService.getFirestore();
    if (!db) {
      log.warn('[GitHub] Firestore not initialized, skipping check');
      return;
    }

    try {
      // Get users with push tokens
      const usersSnapshot = await db
        .collection('users')
        .where('pushToken', '!=', null)
        .get();

      if (usersSnapshot.empty) {
        log.debug('[GitHub] No users with push tokens found');
        return;
      }

      log.info(`[GitHub] Checking activity for ${usersSnapshot.size} users`);

      const checkPromises = usersSnapshot.docs.map(doc =>
        this.checkUserActivity(doc.id, doc.data())
      );

      await Promise.allSettled(checkPromises);

      log.info('[GitHub] Activity check complete');
    } catch (error: any) {
      log.error('[GitHub] Error during activity check:', error.message);
    }
  }

  /**
   * Check GitHub activity for a specific user
   */
  private async checkUserActivity(userId: string, userData: any): Promise<void> {
    try {
      // Check if user has GitHub accounts configured
      const gitAccounts = userData.gitAccounts || [];
      const githubAccount = gitAccounts.find((acc: any) => acc.provider === 'github');

      if (!githubAccount || !githubAccount.token) {
        log.debug(`[GitHub] User ${userId} has no GitHub account configured`);
        return;
      }

      // Check notification preferences
      const preferences = userData.notificationPreferences || {};
      if (preferences.githubActivity === false) {
        log.debug(`[GitHub] User ${userId} has GitHub notifications disabled`);
        return;
      }

      // Fetch GitHub notifications
      const since = this.lastCheck.get(userId);
      const notifications = await this.fetchGitHubNotifications(githubAccount.token, since);

      if (notifications.length === 0) {
        log.debug(`[GitHub] No new notifications for user ${userId}`);
        this.lastCheck.set(userId, new Date().toISOString());
        return;
      }

      log.info(`[GitHub] Found ${notifications.length} notifications for user ${userId}`);

      // Filter to monitored repositories (if user has specified any)
      const monitoredRepos = userData.monitoredRepos || [];
      let filteredNotifications = notifications;

      if (monitoredRepos.length > 0) {
        filteredNotifications = notifications.filter(notif =>
          monitoredRepos.includes(notif.repository.full_name)
        );
      }

      if (filteredNotifications.length === 0) {
        log.debug(`[GitHub] No relevant notifications for user ${userId}`);
        this.lastCheck.set(userId, new Date().toISOString());
        return;
      }

      // Send notifications (max 3 to avoid spam)
      const toNotify = filteredNotifications.slice(0, 3);
      await this.sendNotifications(userId, toNotify);

      // Update last check timestamp
      this.lastCheck.set(userId, new Date().toISOString());
    } catch (error: any) {
      log.error(`[GitHub] Error checking activity for user ${userId}:`, error.message);
    }
  }

  /**
   * Fetch GitHub notifications via API
   */
  private async fetchGitHubNotifications(
    token: string,
    since?: string
  ): Promise<GitHubNotification[]> {
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      };

      if (since) {
        headers['If-Modified-Since'] = since;
      }

      const res = await fetch('https://api.github.com/notifications', {
        headers,
        method: 'GET',
      });

      if (res.status === 304) {
        // Not modified
        return [];
      }

      if (!res.ok) {
        log.error(`[GitHub] API error: ${res.status} ${res.statusText}`);
        return [];
      }

      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (error: any) {
      log.error('[GitHub] Error fetching notifications:', error.message);
      return [];
    }
  }

  /**
   * Send push notifications for GitHub activity
   */
  private async sendNotifications(
    userId: string,
    notifications: GitHubNotification[]
  ): Promise<void> {
    if (notifications.length === 0) return;

    try {
      if (notifications.length === 1) {
        // Single notification
        const notif = notifications[0];
        await notificationService.sendToUser(
          userId,
          {
            title: `GitHub: ${notif.repository.full_name}`,
            body: notif.subject.title,
            type: 'github_activity',
          },
          {
            repo: notif.repository.full_name,
            type: notif.subject.type,
            reason: notif.reason,
          }
        );
      } else {
        // Multiple notifications
        await notificationService.sendToUser(
          userId,
          {
            title: 'GitHub Activity',
            body: `${notifications.length} new notifications`,
            type: 'github_activity',
          },
          {
            count: notifications.length.toString(),
          }
        );
      }

      log.info(`[GitHub] Sent ${notifications.length} notifications to user ${userId}`);
    } catch (error: any) {
      log.error(`[GitHub] Error sending notifications to user ${userId}:`, error.message);
    }
  }

  /**
   * Manually trigger a check for a specific user
   */
  async checkUser(userId: string): Promise<void> {
    const db = firebaseService.getFirestore();
    if (!db) {
      throw new Error('Firestore not initialized');
    }

    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) {
      throw new Error('User not found');
    }

    await this.checkUserActivity(userId, doc.data());
  }
}

export const githubActivityService = new GitHubActivityService();
