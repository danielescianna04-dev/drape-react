// Re-export from the single Firebase initialization point
// to avoid double-init errors (auth/already-initialized)
export { app, db, auth } from '../../config/firebase';
