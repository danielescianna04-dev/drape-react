require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require('./firebase-service-account.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: 'drape-mobile-ide',
        storageBucket: 'drape-mobile-ide.appspot.com'
    });
}

const db = admin.firestore();

async function findProject() {
    console.log('Searching for imieiinvestimenti...');
    let snapshot = await db.collection('projects').where('name', '==', 'imieiinvestimenti').get();

    if (snapshot.empty) {
        console.log('Searching for case-insensitive or partial match...');
        const all = await db.collection('projects').get();
        const matches = all.docs.filter(doc => {
            const name = doc.data().name || '';
            return name.toLowerCase().includes('investimenti');
        });

        if (matches.length > 0) {
            console.log('Matches found:');
            matches.forEach(m => console.log(`ID: ${m.id}, Name: ${m.data().name}`));
        } else {
            console.log('No projects found with that name.');
        }
    } else {
        snapshot.forEach(doc => {
            console.log(`ID: ${doc.id}, Name: ${doc.data().name}`);
        });
    }
}

findProject().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
