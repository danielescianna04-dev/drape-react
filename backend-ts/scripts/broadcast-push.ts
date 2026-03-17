/**
 * Send a push notification to ALL users with a valid Expo push token.
 * Usage: npx tsx scripts/broadcast-push.ts "Title" "Body message"
 */
import * as admin from 'firebase-admin';
import * as path from 'path';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Init Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
}
const db = admin.firestore();

async function main() {
  const title = process.argv[2];
  const body = process.argv[3];

  if (!title || !body) {
    console.error('Usage: npx tsx scripts/broadcast-push.ts "Title" "Body"');
    process.exit(1);
  }

  console.log(`📢 Broadcasting: "${title}" — "${body}"`);

  // Get all users with pushToken
  const usersSnap = await db.collection('users').get();
  const tokens: string[] = [];
  let skipped = 0;

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const token = data.pushToken;
    if (token && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))) {
      tokens.push(token);
    } else {
      skipped++;
    }
  }

  console.log(`Found ${tokens.length} valid tokens (${skipped} users without token)`);

  if (tokens.length === 0) {
    console.log('No tokens to send to.');
    process.exit(0);
  }

  // Send in batches of 100 (Expo limit)
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  let sent = 0;
  let failed = 0;

  for (const chunk of chunks) {
    const messages = chunk.map(token => ({
      to: token,
      title,
      body,
      sound: 'default' as const,
      badge: 1,
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json();
      if (result.data) {
        for (const item of result.data) {
          if (item.status === 'ok') sent++;
          else failed++;
        }
      }
    } catch (err: any) {
      console.error('Batch error:', err.message);
      failed += chunk.length;
    }
  }

  console.log(`✅ Done: ${sent} sent, ${failed} failed`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
