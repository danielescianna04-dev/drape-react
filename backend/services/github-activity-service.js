/**
 * GitHub Activity Service
 * Polls GitHub API for new commits and PRs on user repositories
 * Sends push notifications for relevant activity
 */

const admin = require('firebase-admin');
const notificationService = require('./notification-service');

class GitHubActivityService {
  /**
   * Check all users for new GitHub activity and send notifications.
   * Called by cron job every 15 minutes.
   */
  async checkAndNotify() {
    try {
      const db = admin.firestore();

      // Query users who have push tokens and GitHub accounts
      const usersSnapshot = await db.collection('users')
        .where('pushTokens', '!=', [])
        .get();

      if (usersSnapshot.empty) {
        return;
      }

      let totalNotifications = 0;

      for (const userDoc of usersSnapshot.docs) {
        try {
          const userData = userDoc.data();
          const userId = userDoc.id;

          // Skip if user opted out of GitHub notifications
          if (userData.notificationPreferences?.github === false) continue;

          // Get user's GitHub accounts
          const accountsSnapshot = await db
            .collection('users').doc(userId)
            .collection('git-accounts').get();

          if (accountsSnapshot.empty) continue;

          // Get user's projects to know which repos to monitor
          const projectsSnapshot = await db
            .collection('projects')
            .where('userId', '==', userId)
            .where('repositoryUrl', '!=', null)
            .get();

          if (projectsSnapshot.empty) continue;

          const monitoredRepos = new Set();
          projectsSnapshot.forEach(p => {
            const repoUrl = p.data().repositoryUrl;
            if (repoUrl) {
              const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
              if (match) monitoredRepos.add(match[1].toLowerCase());
            }
          });

          if (monitoredRepos.size === 0) continue;

          // Get a valid GitHub token
          let githubToken = null;
          for (const accountDoc of accountsSnapshot.docs) {
            const account = accountDoc.data();
            if (account.token) {
              githubToken = account.token;
              break;
            }
          }

          if (!githubToken) continue;

          // Check for recent activity
          const notifications = await this._checkUserActivity(
            userId, githubToken, monitoredRepos, userData.lastGithubCheckAt
          );

          for (const notification of notifications) {
            await notificationService.sendToUser(userId, notification.message, notification.data);
            totalNotifications++;
          }

          // Update last check timestamp
          await db.collection('users').doc(userId).set({
            lastGithubCheckAt: new Date().toISOString(),
          }, { merge: true });

        } catch (error) {
          // Skip this user silently (token might be expired, etc.)
          console.warn(`[GitActivity] Error for user ${userDoc.id}:`, error.message);
        }
      }

      if (totalNotifications > 0) {
        console.log(`[GitActivity] Sent ${totalNotifications} GitHub activity notifications`);
      }
    } catch (error) {
      console.error('[GitActivity] Check failed:', error.message);
    }
  }

  /**
   * Check a user's monitored repos for new activity
   */
  async _checkUserActivity(userId, githubToken, monitoredRepos, lastCheckAt) {
    const notifications = [];
    const since = lastCheckAt || new Date(Date.now() - 15 * 60 * 1000).toISOString();

    try {
      // Fetch user's received events (limited to 30 most recent)
      const response = await fetch('https://api.github.com/notifications', {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json',
          'If-Modified-Since': new Date(since).toUTCString(),
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (response.status === 304 || response.status === 401) {
        return notifications; // No new activity or invalid token
      }

      if (!response.ok) return notifications;

      const events = await response.json();
      if (!Array.isArray(events)) return notifications;

      for (const event of events.slice(0, 10)) {
        const repoFullName = event.repository?.full_name?.toLowerCase();
        if (!repoFullName || !monitoredRepos.has(repoFullName)) continue;

        const repoName = event.repository?.name || repoFullName;
        const reason = event.reason;
        const subject = event.subject;

        if (!subject) continue;

        let title, body;

        switch (subject.type) {
          case 'PullRequest':
            title = `Nuova PR su ${repoName}`;
            body = subject.title || 'Nuova Pull Request aperta';
            break;
          case 'Issue':
            title = `Nuova Issue su ${repoName}`;
            body = subject.title || 'Nuova Issue aperta';
            break;
          case 'Commit':
          case 'Release':
            title = `Aggiornamento su ${repoName}`;
            body = subject.title || 'Nuova attivita\'';
            break;
          default:
            continue; // Skip unknown types
        }

        notifications.push({
          message: { title, body, type: 'github_activity' },
          data: { action: 'open_home', repoName: repoFullName },
        });

        // Limit to 3 notifications per user per check
        if (notifications.length >= 3) break;
      }
    } catch (error) {
      // Silent - GitHub API might be rate-limited
    }

    return notifications;
  }
}

module.exports = new GitHubActivityService();
