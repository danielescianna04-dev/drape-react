const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CODER_URL = 'http://34.135.209.234.nip.io';
const ADMIN_EMAIL = 'daniele.scianna04@gmail.com';
const ADMIN_PASSWORD = 'Rotolone01#@';
const ADMIN_USERNAME = 'admin';

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function setup() {
    console.log(`⏳ Connecting to Coder at ${CODER_URL}...`);

    // 1. Wait for health check
    let healthy = false;
    for (let i = 0; i < 30; i++) {
        try {
            await axios.get(`${CODER_URL}/api/v2/buildinfo`);
            healthy = true;
            console.log('✅ Coder is online!');
            break;
        } catch (e) {
            console.log(`   Waiting for Coder API... (${i}/30)`);
            await wait(5000);
        }
    }

    if (!healthy) {
        console.error('❌ Coder did not start in time.');
        process.exit(1);
    }

    // 2. Create First User
    try {
        await axios.post(`${CODER_URL}/api/v2/users/first`, {
            email: ADMIN_EMAIL,
            username: ADMIN_USERNAME,
            password: ADMIN_PASSWORD,
            trial: false
        });
        console.log('✅ Admin user created.');
    } catch (e) {
        if (e.response?.status === 403 || e.response?.status === 400 || e.response?.status === 410) {
            console.log('ℹ️  Admin user likely already exists, skipping creation.');
        } else {
            console.error('❌ Failed to create admin:', e.message);
        }
    }

    // 3. Login
    let sessionToken = '';
    try {
        const res = await axios.post(`${CODER_URL}/api/v2/users/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        sessionToken = res.data.session_token;
        console.log('✅ Logged in successfully.');
    } catch (e) {
        console.error('❌ Login failed:', e.message);
        process.exit(1);
    }

    // 4. Update .env
    const envPath = path.join(__dirname, 'backend', '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    if (!envContent.includes('CODER_SESSION_TOKEN=')) {
        envContent += `\nCODER_SESSION_TOKEN=${sessionToken}\n`;
    } else {
        envContent = envContent.replace(/CODER_SESSION_TOKEN=.*/, `CODER_SESSION_TOKEN=${sessionToken}`);
    }

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Updated backend/.env with session token.');

    // 5. Upload Template (Using the tar command indirectly via API? No, Coder API expects tar)
    // We need to tar the directory first.
    // For simplicity, we just log the token and let manual/CLI steps finish template if needed.
    // But ideally we push the template.

    // Create version
    // Create template
    // ... This is complex via raw API without tar.
    // We will assume the user (me) will use the dashboard or CLI later for templates if this hard part fails.

    console.log('🎉 Setup complete!');
    console.log(`URL: ${CODER_URL}`);
    console.log(`User: ${ADMIN_EMAIL}`);
    console.log(`Pass: ${ADMIN_PASSWORD}`);
    console.log(`Token: ${sessionToken}`);
}

setup();
