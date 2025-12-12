#!/usr/bin/env node

/**
 * Test script to simulate the EXACT preview flow of the mobile app
 *
 * Real mobile app flow:
 * 1. saveGitProject() -> Creates Firebase document -> returns project.id (Firebase doc ID)
 * 2. createWorkstationForProject() -> POST /workstation/create with projectId -> clones repo
 * 3. getWorkstationFiles() -> GET /workstation/{id}/files -> gets file list
 * 4. User clicks preview -> POST /preview/start with workstationId
 *
 * This test simulates all these steps to validate the preview works correctly.
 *
 * Usage: node test-preview.js <github-url>
 * Example: node test-preview.js https://github.com/antfu/vitesse-lite
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';

// Generate a unique project ID (simulating Firebase doc ID)
function generateProjectId() {
  // Firebase document IDs are 20 characters, alphanumeric
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to verify URL is actually accessible
async function verifyUrlAccessible(url, maxAttempts = 10, delayMs = 2000) {
  console.log(`   Checking ${url}...`);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      // Only consider 2xx and 3xx as success - 4xx means page not found/error
      if (response.status >= 200 && response.status < 400) {
        return { accessible: true, status: response.status, attempt: i + 1 };
      } else if (response.status >= 400 && response.status < 500) {
        // 4xx error - server is running but page not found
        return { accessible: false, status: response.status, attempt: i + 1, reason: 'Page not found (4xx)' };
      }
      // 5xx - server error, keep trying
    } catch (err) {
      // Server not ready yet
    }
    if (i < maxAttempts - 1) {
      process.stdout.write(`   Attempt ${i + 1}/${maxAttempts}...\r`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return { accessible: false, attempt: maxAttempts, reason: 'Server not responding' };
}

async function testPreview(repoUrl) {
  console.log('\n' + '='.repeat(70));
  console.log(`🧪 Testing REAL preview flow for: ${repoUrl}`);
  console.log('='.repeat(70) + '\n');

  // Generate a project ID like Firebase would
  const projectId = generateProjectId();
  console.log(`📌 Project ID (simulating Firebase doc ID): ${projectId}`);

  try {
    // ========================================
    // STEP 1: Create workstation (simulates createWorkstationForProject)
    // This is what the mobile app calls after creating the Firebase document
    // ========================================
    console.log('\n📦 Step 1: Creating workstation via /workstation/create...');
    console.log('   (This simulates workstationService.createWorkstationForProject)');

    const createResponse = await fetch(`${API_BASE}/workstation/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryUrl: repoUrl,
        userId: 'test-user-' + Date.now(),
        projectId: projectId,
        projectType: 'git',
        githubToken: null // Public repos only for testing
      })
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Create workstation failed: ${error}`);
    }

    const createData = await createResponse.json();
    console.log(`✅ Workstation created`);
    console.log(`   workstationId: ${createData.workstationId}`);
    console.log(`   status: ${createData.status}`);
    console.log(`   filesCount: ${createData.filesCount || 'N/A'}`);

    // The workstationId returned is "ws-{projectId}" - but the repo is cloned using projectId
    // We need to use the same ID that the mobile app would use (just projectId, not ws-projectId)

    // ========================================
    // STEP 2: Get files (simulates getWorkstationFiles)
    // The mobile app calls this to populate the file explorer
    // ========================================
    console.log('\n📂 Step 2: Getting files via /workstation/{id}/files...');
    console.log('   (This simulates workstationService.getWorkstationFiles)');

    // The mobile app uses project.id directly (without ws- prefix)
    const filesResponse = await fetch(
      `${API_BASE}/workstation/${projectId}/files?repositoryUrl=${encodeURIComponent(repoUrl)}`,
      { method: 'GET' }
    );

    if (!filesResponse.ok) {
      const error = await filesResponse.text();
      throw new Error(`Get files failed: ${error}`);
    }

    const filesData = await filesResponse.json();
    console.log(`✅ Files retrieved: ${filesData.files?.length || 0} files`);

    // ========================================
    // STEP 3: Start preview (simulates PreviewPanel.handleStartServer)
    // The mobile app calls this when user clicks "Start Preview"
    // ========================================
    console.log('\n🚀 Step 3: Starting preview via /preview/start...');
    console.log('   (This simulates PreviewPanel.handleStartServer)');

    // IMPORTANT: The mobile app uses currentWorkstation.id which is project.id (from Firebase)
    // NOT ws-{projectId} - the server handles the ws- prefix internally if needed
    const workstationId = projectId;
    console.log(`   Using workstationId: ${workstationId}`);
    console.log(`   Also passing repositoryUrl for fallback clone`);

    const startTime = Date.now();
    const previewResponse = await fetch(`${API_BASE}/preview/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workstationId: workstationId,
        repositoryUrl: repoUrl, // Mobile app also passes this
        forceRefresh: true
      })
    });

    const previewData = await previewResponse.json();
    const apiTime = Date.now() - startTime;

    if (previewData.success) {
      console.log('\n' + '-'.repeat(50));
      console.log('✅ PREVIEW API RETURNED SUCCESS');
      console.log('-'.repeat(50));
      console.log(`📋 Project Type: ${previewData.projectType}`);
      console.log(`🔗 Preview URL: ${previewData.previewUrl}`);
      console.log(`🔌 Port: ${previewData.port}`);
      console.log(`⏱️  API Response Time: ${apiTime}ms`);
      console.log(`⏱️  Server Timing: ${previewData.timing?.totalMs}ms`);
      console.log(`📦 Commands:`);
      console.log(`   Install: ${previewData.commands?.install}`);
      console.log(`   Start: ${previewData.commands?.start}`);
      console.log(`🏥 serverReady (from API): ${previewData.serverReady}`);

      if (previewData.hasBackend) {
        console.log(`🔧 Backend: ${previewData.backendUrl}`);
      }

      // ========================================
      // STEP 4: Verify the URL is ACTUALLY accessible
      // This is what would happen when the WebView loads the preview
      // ========================================
      console.log('\n🔍 Step 4: Verifying preview URL is actually accessible...');
      console.log('   (This simulates the WebView loading the preview)');

      const verification = await verifyUrlAccessible(previewData.previewUrl);

      if (verification.accessible) {
        console.log(`\n✅ SUCCESS! URL is accessible (HTTP ${verification.status}, attempt ${verification.attempt})`);
        return {
          success: true,
          verified: true,
          data: previewData,
          projectId: projectId
        };
      } else {
        console.log(`\n❌ FAILURE! URL is NOT accessible after ${verification.attempt} attempts`);
        if (verification.status) {
          console.log(`   HTTP Status: ${verification.status}`);
        }
        console.log(`   Reason: ${verification.reason || 'Unknown'}`);
        console.log(`   The API said success but the preview URL doesn't work.`);
        console.log(`   Check backend logs for errors.`);
        return {
          success: false,
          verified: false,
          data: previewData,
          error: verification.reason || 'Preview URL not accessible',
          httpStatus: verification.status,
          projectId: projectId
        };
      }
    } else {
      console.log('\n❌ PREVIEW API RETURNED FAILURE');
      console.log(`Error: ${previewData.error}`);
      if (previewData.errorDetails) {
        console.log(`Details: ${previewData.errorDetails}`);
      }
      if (previewData.requiresEnvVars) {
        console.log(`\n⚠️ Project requires environment variables:`);
        previewData.envVars?.forEach(v => {
          console.log(`   ${v.key}: ${v.description || 'No description'} ${v.required ? '(required)' : '(optional)'}`);
        });
      }
      return {
        success: false,
        error: previewData.error,
        data: previewData,
        projectId: projectId
      };
    }

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Test projects list - FASE 1: Guaranteed frameworks (all public repos)
// Using standalone repos that can be cloned directly
const testProjects = [
  // ===== STATIC HTML =====
  { name: '1. Static HTML', url: 'https://github.com/tobiasahlin/SpinKit', framework: 'static' },

  // ===== REACT + VITE =====
  { name: '2. React + Vite', url: 'https://github.com/joaopaulomoraes/reactjs-vite-tailwindcss-boilerplate', framework: 'react-vite' },

  // ===== VUE + VITE =====
  { name: '3. Vue 3 + Vite', url: 'https://github.com/antfu/vitesse-lite', framework: 'vue-vite' },

  // ===== SVELTE =====
  { name: '4. Svelte', url: 'https://github.com/sveltejs/template', framework: 'svelte' },

  // ===== NEXT.JS =====
  { name: '5. Next.js', url: 'https://github.com/timlrx/tailwind-nextjs-starter-blog', framework: 'nextjs' },

  // ===== NUXT 3 =====
  { name: '6. Nuxt 3', url: 'https://github.com/viandwi24/nuxt3-awesome-starter', framework: 'nuxt' },

  // ===== ASTRO =====
  { name: '7. Astro', url: 'https://github.com/surjithctly/astroship', framework: 'astro' },

  // ===== FLASK =====
  { name: '8. Flask', url: 'https://github.com/jakerieger/FlaskIntroduction', framework: 'flask' },
];

async function runTests() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Test single URL provided as argument
    const result = await testPreview(args[0]);

    console.log('\n' + '═'.repeat(70));
    console.log('📊 FINAL RESULT');
    console.log('═'.repeat(70));
    if (result.success && result.verified) {
      console.log('✅ TEST PASSED - Preview is working correctly');
      console.log(`   Preview URL: ${result.data?.previewUrl}`);
    } else if (result.data?.success && !result.verified) {
      console.log('⚠️  TEST FAILED - API succeeded but preview not accessible');
      console.log('   This indicates a bug in the preview system!');
    } else {
      console.log('❌ TEST FAILED');
      console.log(`   Error: ${result.error}`);
    }
  } else {
    // Run all tests
    console.log('🧪 Running all preview tests...\n');
    console.log('This will test the REAL preview flow for multiple projects.');
    console.log('Each test simulates exactly what the mobile app does.\n');

    const results = [];
    for (const project of testProjects) {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`Testing: ${project.name}`);
      const result = await testPreview(project.url);
      results.push({ ...project, ...result });

      // Wait between tests to let ports free up
      console.log('\n⏳ Waiting 5 seconds before next test...');
      await new Promise(r => setTimeout(r, 5000));
    }

    // Summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('═'.repeat(70));

    for (const r of results) {
      let status, detail;
      if (r.success && r.verified) {
        status = '✅';
        detail = `${r.data?.previewUrl} (VERIFIED WORKING)`;
      } else if (r.data?.success && !r.verified) {
        status = '⚠️ ';
        detail = `API OK but URL NOT ACCESSIBLE - BUG!`;
      } else {
        status = '❌';
        detail = r.error || 'Unknown error';
      }
      console.log(`${status} ${r.name}`);
      console.log(`   ${detail}`);
    }

    const verified = results.filter(r => r.success && r.verified).length;
    const apiSuccess = results.filter(r => r.data?.success).length;
    const buggy = apiSuccess - verified;

    console.log('\n' + '-'.repeat(50));
    console.log(`📈 Results: ${verified}/${results.length} fully working`);
    if (buggy > 0) {
      console.log(`⚠️  ${buggy} projects have the bug (API success but preview broken)`);
    }
    console.log('═'.repeat(70));
  }
}

runTests();
