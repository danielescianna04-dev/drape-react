const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CODER_URL = 'http://drape.info';
const ADMIN_EMAIL = 'daniele.scianna04@gmail.com';
const ADMIN_PASSWORD = 'Rotolone01#@';

async function setup() {
    console.log(`⏳ Connecting to Coder at ${CODER_URL}...`);

    // 1. Login to get token
    try {
        console.log('🔑 Logging in...');
        const loginRes = await axios.post(`${CODER_URL}/api/v2/users/login`, {
            email: ADMIN_EMAIL,
            password: ADMIN_PASSWORD
        });
        const sessionToken = loginRes.data.session_token;
        console.log('✅ Logged in successfully.');

        // 2. Prepare Template
        console.log('📦 Packaging template...');
        const templateDir = path.join(__dirname, 'backend/coder-templates/standard-workspace');
        execSync(`tar -czf template.tar.gz -C "${templateDir}" .`);

        // 3. Create or Update Template Version
        // First get organization
        const orgsRes = await axios.get(`${CODER_URL}/api/v2/organizations`, {
            headers: { 'Coder-Session-Token': sessionToken }
        });
        const orgId = orgsRes.data[0].id; // Default organization

        // Get template ID if exists
        let templateId;
        try {
            const templatesRes = await axios.get(`${CODER_URL}/api/v2/organizations/${orgId}/templates/standard-workspace`, {
                headers: { 'Coder-Session-Token': sessionToken }
            });
            templateId = templatesRes.data.id;
            console.log(`ℹ️  Template exists (ID: ${templateId}), creating new version...`);
        } catch (e) {
            console.log('ℹ️  Template does not exist, will create it (requires more steps, assuming update for now).');
        }

        if (templateId) {
            // Upload new version
            const fileContent = fs.readFileSync('template.tar.gz');
            const versionRes = await axios.post(`${CODER_URL}/api/v2/templates/${templateId}/versions`, fileContent, {
                headers: {
                    'Coder-Session-Token': sessionToken,
                    'Content-Type': 'application/x-tar'
                }
            });
            const versionId = versionRes.data.id;
            console.log(`✅ Version uploaded: ${versionRes.data.name}`);

            // Wait for build
            console.log('⏳ Waiting for template build...');
            await new Promise(r => setTimeout(r, 5000)); // Simple wait

            // Promote version
            await axios.patch(`${CODER_URL}/api/v2/organizations/${orgId}/templates/${templateId}`, {
                active_version_id: versionId
            }, {
                headers: { 'Coder-Session-Token': sessionToken }
            });
            console.log('🚀 Template updated and active!');
        }

    } catch (e) {
        console.error('❌ Error:', e.response?.data || e.message);
    } finally {
        if (fs.existsSync('template.tar.gz')) fs.unlinkSync('template.tar.gz');
    }
}

setup();
