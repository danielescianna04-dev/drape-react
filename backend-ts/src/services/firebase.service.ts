import admin from 'firebase-admin';
import { config } from '../config';
import { log } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';

class FirebaseService {
  private app: admin.app.App | null = null;
  private db: admin.firestore.Firestore | null = null;

  initialize(): void {
    if (this.app) return;

    try {
      // Load service account for FCM support
      const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');

      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        this.app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: config.googleCloudProject,
        });
        log.info('[Firebase] Initialized with service account (FCM enabled)');
      } else {
        this.app = admin.initializeApp({
          projectId: config.googleCloudProject,
        });
        log.warn('[Firebase] Initialized without service account (FCM disabled)');
      }

      this.db = admin.firestore();
    } catch (err: any) {
      if (err.code === 'app/duplicate-app') {
        this.app = admin.app();
        this.db = admin.firestore();
      } else {
        log.error('[Firebase] Init failed:', err.message);
      }
    }
  }

  getDb(): admin.firestore.Firestore {
    if (!this.db) this.initialize();
    return this.db!;
  }

  getFirestore(): admin.firestore.Firestore | null {
    return this.db;
  }

  getAuth(): admin.auth.Auth {
    if (!this.app) this.initialize();
    return admin.auth(this.app!);
  }

  getMessaging(): admin.messaging.Messaging {
    if (!this.app) this.initialize();
    return admin.messaging(this.app!);
  }

  /**
   * Get project metadata from Firestore
   */
  async getProjectMetadata(projectId: string): Promise<Record<string, any> | null> {
    const db = this.getDb();
    try {
      const doc = await db.collection('projects').doc(projectId).get();
      if (doc.exists) return doc.data() || null;

      // Fallback: search workstations
      const ws = await db.collection('workstations')
        .where('projectId', '==', projectId)
        .limit(1)
        .get();
      if (!ws.empty) return ws.docs[0].data();

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Save project metadata to Firestore
   */
  async saveProjectMetadata(projectId: string, metadata: Record<string, any>): Promise<void> {
    const db = this.getDb();
    await db.collection('projects').doc(projectId).set(metadata, { merge: true });
  }
}

export const firebaseService = new FirebaseService();
