import * as SecureStore from 'expo-secure-store';

const TOKEN_PREFIX = 'github-token-';

export const githubTokenService = {
  async saveToken(owner: string, token: string, userId: string): Promise<void> {
    const key = `${TOKEN_PREFIX}${userId}-${owner}`;
    try {
      await SecureStore.setItemAsync(key, token);
      console.log('✅ GitHub token saved securely for', owner);
    } catch (error) {
      console.error('❌ Error saving GitHub token:', error);
      throw error;
    }
  },

  async getToken(owner: string, userId: string): Promise<string | null> {
    const key = `${TOKEN_PREFIX}${userId}-${owner}`;
    try {
      const token = await SecureStore.getItemAsync(key);
      if (token) {
        console.log('✅ GitHub token retrieved for', owner);
      } else {
        console.log('⚠️ No GitHub token found for', owner);
      }
      return token;
    } catch (error) {
      console.error('❌ Error retrieving GitHub token:', error);
      return null;
    }
  },

  async deleteToken(owner: string, userId: string): Promise<void> {
    const key = `${TOKEN_PREFIX}${userId}-${owner}`;
    try {
      await SecureStore.deleteItemAsync(key);
      console.log('✅ GitHub token deleted for', owner);
    } catch (error) {
      console.error('❌ Error deleting GitHub token:', error);
      throw error;
    }
  },
};
