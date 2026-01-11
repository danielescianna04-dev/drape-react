
const admin = require('firebase-admin');
const path = require('path');
require('dotenv').config();

// Initialize Firebase Admin if not already initialized
if (admin.apps.length === 0) {
    const serviceAccount = require('./service-account-key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

async function listSomeProjects() {
    const db = admin.firestore();
    console.log('Fetching projects...');
    const snapshot = await db.collection('projects').limit(5).get();

    if (snapshot.empty) {
        console.log('No projects found.');
        return;
    }

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`- ID: ${doc.id}, Name: ${data.name || 'N/A'}, Tech: ${data.technology || 'N/A'}`);
    });
}

listSomeProjects().catch(console.error);
