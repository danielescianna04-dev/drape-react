const admin = require('firebase-admin');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert('./service-account-key.json'),
        projectId: 'drape-mobile-ide'
    });
}
const db = admin.firestore();

async function getFile(path) {
    const snapshot = await db.collection('projects').doc('ws-1766965201848-unrxdj3ut').collection('files').get();
    const doc = snapshot.docs.find(d => d.data().path === path);
    if (doc) console.log(doc.data().content);
    else console.log('FILE NOT FOUND: ' + path);
}

getFile('index.html').then(() => process.exit(0));
