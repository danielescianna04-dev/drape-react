const storageService = require('./services/storage-service');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
require('dotenv').config();

try { initializeApp(); } catch (e) { }

const PROJECT_ID = 'hFy5l3kyhnVvXC5Myo50';

async function checkStorage() {
    console.log(`Checking files for ${PROJECT_ID}...`);
    try {
        const result = await storageService.listFiles(PROJECT_ID);
        const files = result.files;
        console.log(`Found ${files.length} files.`);

        const pkgJson = files.find(f => f.path === 'package.json');
        if (pkgJson) {
            console.log('✅ package.json found!');
            console.log(pkgJson);
        } else {
            console.log('❌ package.json NOT found in storage!');
            // List all files
            files.forEach(f => console.log(f.path));
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

checkStorage();
