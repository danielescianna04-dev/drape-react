// Script to list all projects in Firebase
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDPWDvrOQAzARqh9ecUHlv_WVRteQN2slE",
  authDomain: "drape-mobile-ide.firebaseapp.com",
  projectId: "drape-mobile-ide",
  storageBucket: "drape-mobile-ide.firebasestorage.app",
  messagingSenderId: "74904913373",
  appId: "1:74904913373:web:3a88a420928a868083e234"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function listAllProjects() {
  console.log('📋 Listing all projects...\n');

  const snapshot = await getDocs(collection(db, 'user_projects'));

  console.log(`Total projects: ${snapshot.size}\n`);

  snapshot.docs.forEach((docSnap, i) => {
    const data = docSnap.data();
    console.log(`${i + 1}. ${data.name}`);
    console.log(`   ID: ${docSnap.id}`);
    console.log(`   userId: ${data.userId}`);
    console.log(`   type: ${data.type}`);
    console.log('');
  });

  process.exit(0);
}

listAllProjects().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
