// v2 stub: push notifications non in scope per il lancio v2.
// TODO post-PMF: implementare con expo-notifications + token salvato in profiles/user_configs.
// L'API è preservata (initialize, updatePreferences) per non rompere i caller.

class PushNotificationService {
  async initialize(_userId?: string): Promise<void> {
    // v2 stub: no-op
  }

  async updatePreferences(_userIdOrPrefs: string | Record<string, unknown>, _prefs?: Record<string, unknown>): Promise<void> {
    // v2 stub: no-op
  }
}

export const pushNotificationService = new PushNotificationService();
