/**
 * Send a push notification to a specific user by email.
 * Usage: npx tsx scripts/send-push-to-user.ts "email@example.com" "Title" "Body message"
 */
import * as admin from 'firebase-admin';
import * as path from 'path';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath),
  });
}
const db = admin.firestore();

async function main() {
  const email = process.argv[2];
  const title = process.argv[3];
  const body = process.argv[4];

  if (!email || !title || !body) {
    console.error('Usage: npx tsx scripts/send-push-to-user.ts "email" "Title" "Body"');
    process.exit(1);
  }

  console.log(`🔍 Looking up user: ${email}`);

  // Find user by email
  const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();

  if (usersSnap.empty) {
    console.error(`❌ No user found with email: ${email}`);
    process.exit(1);
  }

  const userDoc = usersSnap.docs[0];
  const userData = userDoc.data();
  const token = userData.pushToken;

  console.log(`👤 Found user: ${userData.displayName || userData.name || userDoc.id}`);

  if (!token || (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken['))) {
    console.error(`❌ User has no valid push token. Token: ${token || 'none'}`);
    process.exit(1);
  }

  console.log(`📤 Sending: "${title}" — "${body}"`);

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{
      to: token,
      title,
      body,
      sound: 'default',
      badge: 1,
    }]),
  });

  const result = await response.json();

  if (result.data?.[0]?.status === 'ok') {
    console.log(`✅ Notification sent successfully!`);
  } else {
    console.error(`❌ Failed:`, JSON.stringify(result, null, 2));
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
