
const { grepSearch } = require('./services/tools/grep');
const { globSearch } = require('./services/tools/glob');
const path = require('path');

async function testTools() {
    console.log('🔍 Starting Drape AI Tools Diagnostic...');

    // 1. Test Glob Search
    console.log('\n--- Testing Glob Search ---');
    try {
        const globResult = await globSearch('*.js', './services/tools', 10);
        console.log(`✅ Glob Search works: found ${globResult.files.length} files`);
        console.log('Files:', globResult.files.join(', '));
    } catch (e) {
        console.error('❌ Glob Search failed:', e.message);
    }

    // 2. Test Grep Search
    console.log('\n--- Testing Grep Search ---');
    try {
        const grepResult = await grepSearch('grepSearch', {
            searchPath: './services/tools',
            outputMode: 'files_with_matches'
        });
        console.log(`✅ Grep Search works: found matches in ${grepResult.results.length} files`);
        console.log('Matches:', grepResult.results.join(', '));
    } catch (e) {
        console.error('❌ Grep Search failed:', e.message);
    }

    // 3. Test System Prompt Loading
    console.log('\n--- Testing System Prompt ---');
    try {
        const { getSystemPrompt } = require('./services/system-prompt');
        const prompt = getSystemPrompt({
            projectContext: { projectName: 'Diagnostic Test', language: 'JavaScript' }
        });
        if (prompt.includes('Claude Code') || prompt.includes('Drape AI')) {
            console.log('✅ System Prompt loaded and valid');
            console.log('Snippet:', prompt.substring(0, 100) + '...');
        } else {
            console.warn('⚠️ System Prompt loaded but might be missing expected keywords');
        }
    } catch (e) {
        console.error('❌ System Prompt loading failed:', e.message);
    }

    console.log('\n🚀 Diagnostic Complete!');
}

testTools();
