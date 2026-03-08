import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';

/**
 * Lightweight analytics service — writes events to Firestore `user_events` collection.
 * Events are aggregated server-side for the admin behavior dashboard.
 */

export function trackScreenView(screen: string) {
  const user = auth.currentUser;
  if (!user) return;
  addDoc(collection(db, 'user_events'), {
    type: 'screen_view',
    screen,
    userId: user.uid,
    email: user.email || '',
    timestamp: serverTimestamp(),
  }).catch(() => {});
}
