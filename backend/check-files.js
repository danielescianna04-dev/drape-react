const admin = require('firebase-admin');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert('./service-account-key.json'),
        projectId: 'drape-mobile-ide'
    });
}
const db = admin.firestore();

async function getFiles() {
    const filesRef = db.collection('projects').doc('ws-1766965201848-unrxdj3ut').collection('files');
    const snapshot = await filesRef.get();
    console.log('Total files:', snapshot.docs.length);
    console.log('\nFile paths:');
    snapshot.docs.forEach(doc => console.log(' -', doc.data().path));

    // Get package.json content
    const pkgDoc = snapshot.docs.find(d => d.data().path === 'package.json');
    if (pkgDoc) {
        console.log('\n--- package.json content ---\n');
        console.log(pkgDoc.data().content);
    }
}

getFiles().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
});
