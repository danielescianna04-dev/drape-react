export const githubTokenService = {
  async saveToken(owner: string, token: string, userId: string): Promise<void> {
    console.log('Saving token for', owner, userId);
  },
};