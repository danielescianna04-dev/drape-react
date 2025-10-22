import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface GitHubToken {
  id: string;
  username: string;
  token: string;
  userId: string;
  createdAt: Date;
}

const COLLECTION = 'github_tokens';

export const githubTokenService = {
  async saveToken(username: string, token: string, userId: string): Promise<void> {
    const tokenDoc = {
      username,
      token,
      userId,
      createdAt: new Date(),
    };
    
    await setDoc(doc(db, COLLECTION, `${userId}_${username}`), tokenDoc);
  },

  async getTokens(userId: string): Promise<GitHubToken[]> {
    const q = query(collection(db, COLLECTION), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as GitHubToken[];
  },

  async getTokenForRepo(repositoryUrl: string, userId: string): Promise<string | null> {
    const match = repositoryUrl.match(/github\.com\/([^\/]+)\//);
    if (!match) return null;
    
    const username = match[1];
    const tokens = await this.getTokens(userId);
    const token = tokens.find(t => t.username === username);
    
    return token?.token || null;
  },
};
