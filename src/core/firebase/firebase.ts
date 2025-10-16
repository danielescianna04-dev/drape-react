import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getSystemConfig, safeLog } from '../config/systemConfig';

// Usa configurazione sistema (iniettata da GitHub Secrets)
const systemConfig = getSystemConfig();
safeLog('🔥 Initializing Firebase with system config');

const app = initializeApp(systemConfig.firebase);

export const db = getFirestore(app);
export const auth = getAuth(app);

safeLog('✅ Firebase initialized successfully');
