// Script to delete all projects with userId: 'anonymous'
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, deleteDoc, doc } = require('firebase/firestore');

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

async function cleanupAnonymousProjects() {
  console.log('🔍 Searching for projects with userId: "anonymous"...');

  const q = query(
    collection(db, 'user_projects'),
    where('userId', '==', 'anonymous')
  );

  const snapshot = await getDocs(q);

  console.log(`📋 Found ${snapshot.size} projects to delete`);

  if (snapshot.size === 0) {
    console.log('✅ No projects to delete');
    process.exit(0);
  }

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    console.log(`🗑️ Deleting: ${data.name} (${docSnap.id})`);
    await deleteDoc(doc(db, 'user_projects', docSnap.id));
  }

  console.log('✅ Cleanup complete!');
  process.exit(0);
}

cleanupAnonymousProjects().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
