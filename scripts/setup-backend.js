#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const readline = require('readline');

console.log('🔧 Setting up Drape Backend...\n');

function exec(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    return error.stdout || '';
  }
}

async function askQuestion(question, defaultValue) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise(resolve => {
    rl.question(`${question} [${defaultValue}]: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function setup() {
  // Check if gcloud is installed
  try {
    exec('gcloud --version');
  } catch (error) {
    console.log('❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install');
    process.exit(1);
  }

  // Get project ID
  const projectId = await askQuestion('Enter your Google Cloud Project ID', 'drape-mobile-ide');
  console.log(`\n📋 Using project: ${projectId}\n`);

  // Set project
  console.log('Setting project...');
  exec(`gcloud config set project ${projectId}`);

  // Enable required APIs
  console.log('🔌 Enabling required APIs...');
  exec(`gcloud services enable firestore.googleapis.com --project=${projectId}`);
  exec(`gcloud services enable aiplatform.googleapis.com --project=${projectId}`);

  // Create service account
  console.log('👤 Creating service account...');
  const createResult = exec(`gcloud iam service-accounts create drape-backend --display-name="Drape Backend Service Account" --project=${projectId} 2>&1`);
  
  if (createResult.includes('already exists')) {
    console.log('   Service account already exists');
  } else {
    console.log('   Service account created');
  }

  // Grant permissions
  console.log('🔐 Granting Firestore permissions...');
  exec(`gcloud projects add-iam-policy-binding ${projectId} --member="serviceAccount:drape-backend@${projectId}.iam.gserviceaccount.com" --role="roles/datastore.user"`);

  // Create key
  console.log('🔑 Creating service account key...');
  const keyPath = 'backend/service-account-key.json';
  
  if (fs.existsSync(keyPath)) {
    const answer = await askQuestion('Service account key already exists. Overwrite?', 'n');
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('✅ Keeping existing key');
      return;
    }
  }

  exec(`gcloud iam service-accounts keys create ${keyPath} --iam-account=drape-backend@${projectId}.iam.gserviceaccount.com --project=${projectId}`);

  // Update backend .env
  console.log('📝 Updating backend .env...');
  const envContent = `GOOGLE_CLOUD_PROJECT=${projectId}\nPORT=3000\n`;
  fs.writeFileSync('backend/.env', envContent);

  console.log('\n✅ Backend setup complete!\n');
  console.log('To start backend:');
  console.log('  cd backend');
  
  if (process.platform === 'win32') {
    console.log('  set GOOGLE_APPLICATION_CREDENTIALS=.\\service-account-key.json');
    console.log('  node server.js');
  } else {
    console.log('  GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json node server.js');
  }
  console.log('');
}

setup().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
