#!/usr/bin/env node

/**
 * Test script to simulate the full preview flow without the mobile app
 * Usage: node test-preview.js <github-url>
 * Example: node test-preview.js https://github.com/antfu/vitesse-lite
 */

const API_BASE = 'http://192.168.0.57:3001';

async function testPreview(repoUrl) {
  console.log('\n' + '='.repeat(60));
  console.log(`🧪 Testing preview for: ${repoUrl}`);
  console.log('='.repeat(60) + '\n');

  // Generate a unique workstation ID
  const workstationId = `test-${Date.now()}`;
  console.log(`📌 Workstation ID: ${workstationId}`);

  try {
    // Step 1: Clone the repository (simulate /workstation/:id/files)
    console.log('\n📦 Step 1: Cloning repository...');
    const cloneResponse = await fetch(
      `${API_BASE}/workstation/${workstationId}/files?repositoryUrl=${encodeURIComponent(repoUrl)}`,
      { method: 'GET' }
    );

    if (!cloneResponse.ok) {
      const error = await cloneResponse.text();
      throw new Error(`Clone failed: ${error}`);
    }

    const cloneData = await cloneResponse.json();
    console.log(`✅ Cloned ${cloneData.files?.length || 0} files`);

    // Step 2: Start preview
    console.log('\n🚀 Step 2: Starting preview...');
    const previewResponse = await fetch(`${API_BASE}/preview/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workstationId: `ws-${workstationId}`,
        forceRefresh: true
      })
    });

    const previewData = await previewResponse.json();

    if (previewData.success) {
      console.log('\n' + '='.repeat(60));
      console.log('✅ PREVIEW STARTED SUCCESSFULLY!');
      console.log('='.repeat(60));
      console.log(`📋 Project Type: ${previewData.projectType}`);
      console.log(`🔗 Preview URL: ${previewData.previewUrl}`);
      console.log(`🔌 Port: ${previewData.port}`);
      console.log(`⏱️  Time: ${previewData.timing?.totalMs}ms`);
      console.log(`📦 Commands:`);
      console.log(`   Install: ${previewData.commands?.install}`);
      console.log(`   Start: ${previewData.commands?.start}`);

      if (previewData.serverReady) {
        console.log('\n🟢 Server is ready and responding!');
      } else {
        console.log('\n🟡 Server started but may still be initializing...');
      }

      return { success: true, data: previewData };
    } else {
      console.log('\n❌ PREVIEW FAILED');
      console.log(`Error: ${previewData.error}`);
      if (previewData.errorDetails) {
        console.log(`Details: ${previewData.errorDetails}`);
      }
      return { success: false, error: previewData.error };
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Test projects list
const testProjects = [
  { name: 'Vue 3 (pnpm)', url: 'https://github.com/antfu/vitesse-lite' },
  { name: 'React Vite', url: 'https://github.com/joaopaulomoraes/reactjs-vite-tailwindcss-boilerplate' },
  { name: 'Static HTML', url: 'https://github.com/tobiasahlin/SpinKit' },
  { name: 'Next.js', url: 'https://github.com/vercel/next-learn' },
  { name: 'Svelte', url: 'https://github.com/sveltejs/template' },
];

async function runTests() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Test single URL provided as argument
    await testPreview(args[0]);
  } else {
    // Run all tests
    console.log('🧪 Running all preview tests...\n');

    const results = [];
    for (const project of testProjects) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`Testing: ${project.name}`);
      const result = await testPreview(project.url);
      results.push({ ...project, ...result });

      // Wait a bit between tests
      await new Promise(r => setTimeout(r, 2000));
    }

    // Summary
    console.log('\n\n' + '═'.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('═'.repeat(60));

    for (const r of results) {
      const status = r.success ? '✅' : '❌';
      console.log(`${status} ${r.name}: ${r.success ? r.data?.previewUrl : r.error}`);
    }

    const passed = results.filter(r => r.success).length;
    console.log(`\n📈 ${passed}/${results.length} tests passed`);
  }
}

runTests();
