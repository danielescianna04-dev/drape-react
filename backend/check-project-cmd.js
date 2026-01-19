const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkProject() {
    const projectId = 'hFy5l3kyhnVvXC5Myo50';

    try {
        const projectDoc = await db.collection('projects').doc(projectId).get();
        if (!projectDoc.exists) {
            console.log('Project not found');
            return;
        }

        const data = projectDoc.data();
        console.log('Project Info:');
        console.log('- Type:', data.type);
        console.log('- Start Command:', data.startCommand || 'NOT SET');
        console.log('- Files count:', data.files?.length || 0);

        // Check package.json if available
        const packageJsonFile = data.files?.find(f => f.name === 'package.json');
        if (packageJsonFile) {
            try {
                const pkg = JSON.parse(packageJsonFile.content);
                console.log('\npackage.json scripts:');
                console.log(JSON.stringify(pkg.scripts, null, 2));
            } catch (e) {
                console.log('Could not parse package.json');
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }

    process.exit(0);
}

checkProject();
