import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { githubTokenService } from '../github/githubTokenService';
import { gitAccountService } from '../git/gitAccountService';
import apiClient from '../api/apiClient';

const MIGRATION_KEY = 'git-accounts-migrated-v2'; // Bumped version to re-run

/**
 * Migrates accounts from githubTokenService to gitAccountService
 * This ensures accounts saved via the old system appear in Settings
 */
export const migrateGitAccounts = async (userId: string): Promise<void> => {
  try {
    // Check if migration already done
    const migrationDone = await AsyncStorage.getItem(`${MIGRATION_KEY}-${userId}`);
    if (migrationDone === 'true') {
      return;
    }

    // Get accounts from old githubTokenService
    const oldAccounts = await githubTokenService.getAccounts(userId);

    // Check existing accounts in gitAccountService
    const existingAccounts = await gitAccountService.getAccounts(userId);
    const existingUsernames = new Set(existingAccounts.map(a => a.username));

    let migratedCount = 0;

    // Migrate from accounts list
    for (const oldAccount of oldAccounts) {
      // Skip if already exists in gitAccountService
      if (existingUsernames.has(oldAccount.username)) {
        continue;
      }

      // Get the token for this account
      const token = await githubTokenService.getToken(oldAccount.owner, userId);

      if (token) {
        try {
          // Save to gitAccountService
          await gitAccountService.saveAccount('github', token, userId);
          existingUsernames.add(oldAccount.username);
          migratedCount++;
        } catch (err) {
          console.warn('⚠️ [Migration] Failed to migrate', oldAccount.username, ':', err);
        }
      } else {
        console.warn('⚠️ [Migration] No token found for', oldAccount.owner);
      }
    }

    // Also try to find tokens by common owner names that might not be in the list
    const commonOwners = ['danielescianna04-dev', 'rivaslleon27'];

    for (const owner of commonOwners) {
      try {
        const tokenKey = `github-token-${userId}-${owner}`;
        const token = await SecureStore.getItemAsync(tokenKey);

        if (token) {

          // Validate and get username
          try {
            const response = await apiClient.get('https://api.github.com/user', {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            });

            const username = response.data.login;

            if (!existingUsernames.has(username)) {
              await gitAccountService.saveAccount('github', token, userId);
              existingUsernames.add(username);
              migratedCount++;
            }
          } catch (apiErr) {
            console.warn('⚠️ [Migration] Token for', owner, 'is invalid or expired');
          }
        }
      } catch (err) {
        // Token not found, skip
      }
    }

    // Mark migration as done
    await AsyncStorage.setItem(`${MIGRATION_KEY}-${userId}`, 'true');

  } catch (error) {
    console.error('❌ [Migration] Error:', error);
  }
};

/**
 * Force re-run migration (useful for debugging)
 */
export const resetMigration = async (userId: string): Promise<void> => {
  await AsyncStorage.removeItem(`${MIGRATION_KEY}-${userId}`);
  await AsyncStorage.removeItem(`git-accounts-migrated-v1-${userId}`);
};
