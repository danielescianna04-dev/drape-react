// Test Firebase + Google Cloud connection
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDwUGNfILmN6ilCHzmFBnoVNKnN-iJ2kwo",
  authDomain: "drape-93229.firebaseapp.com",
  projectId: "drape-93229",
  storageBucket: "drape-93229.firebasestorage.app",
  messagingSenderId: "1047514620673",
  appId: "1:1047514620673:web:b600908a79ec68f7ba3100"
};

async function testConnection() {
  try {
    console.log('🔥 Testing Firebase connection...');
    
    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    
    // Test write to Firestore
    const docRef = await addDoc(collection(db, 'test'), {
      message: 'Hello from Drape!',
      timestamp: new Date(),
      projectId: firebaseConfig.projectId
    });
    
    console.log('✅ Firebase connected! Document ID:', docRef.id);
    console.log('📊 Project ID:', firebaseConfig.projectId);
    
    // Test Google Cloud (same project)
    console.log('☁️ Google Cloud project:', process.env.EXPO_PUBLIC_GCP_PROJECT_ID);
    
    if (firebaseConfig.projectId === process.env.EXPO_PUBLIC_GCP_PROJECT_ID) {
      console.log('🔗 Firebase and Google Cloud are CONNECTED! ✅');
    } else {
      console.log('❌ Firebase and Google Cloud use DIFFERENT projects!');
      console.log('Firebase:', firebaseConfig.projectId);
      console.log('Google Cloud:', process.env.EXPO_PUBLIC_GCP_PROJECT_ID);
    }
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

// Run test
testConnection();
