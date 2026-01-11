const { webSearch } = require('./services/tools/web-search');

async function test() {
    console.log('--- TEST WEB SEARCH ---');
    try {
        const result = await webSearch('Elon Musk dog name');
        console.log('RISULTATO:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('ERRORE:', error);
    }
}

test();
