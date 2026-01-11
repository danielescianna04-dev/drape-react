/**
 * WebSearch Tool
 * Search the web and use results to inform responses
 * Based on Claude Code's WebSearch tool specification
 */

const axios = require('axios');

/**
 * Search the web for information
 * @param {string} query - Search query
 * @param {string[]} allowed_domains - Only include results from these domains
 * @param {string[]} blocked_domains - Never include results from these domains
 * @returns {Promise<Object>} Search results
 */
const cheerio = require('cheerio');

/**
 * Search the web for information using Google (standard) or DuckDuckGo Scraper (fallback)
 */
async function webSearch(query, allowed_domains = [], blocked_domains = []) {
    try {
        console.log(`🌐 Searching web for: "${query}"`);

        let results = [];

        // Try Google Custom Search if API key is provided
        if (process.env.SEARCH_API_KEY && process.env.SEARCH_ENGINE_ID) {
            console.log('🔍 Using Google Custom Search API');
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: process.env.SEARCH_API_KEY,
                    cx: process.env.SEARCH_ENGINE_ID,
                    q: query,
                    num: 10
                }
            });

            results = response.data.items?.map(item => ({
                title: item.title,
                url: item.link,
                snippet: item.snippet
            })) || [];
        } else {
            // Fallback to DuckDuckGo Scraper (Zero-Config)
            console.log('🔍 Using DuckDuckGo Scraper (Zero-Config Fallback)');
            const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const $ = cheerio.load(response.data);
            $('.result').each((i, el) => {
                if (i >= 10) return;
                const title = $(el).find('.result__title').text().trim();
                const url = $(el).find('.result__url').attr('href');
                const snippet = $(el).find('.result__snippet').text().trim();

                if (title && url) {
                    // Extract real URL if it's a redirect
                    let realUrl = url;
                    if (url.includes('uddg=')) {
                        const match = url.match(/uddg=([^&]+)/);
                        if (match) realUrl = decodeURIComponent(match[1]);
                    }

                    results.push({ title, url: realUrl, snippet });
                }
            });
        }

        // Apply domain filtering
        let filteredResults = results;

        if (allowed_domains.length > 0) {
            filteredResults = filteredResults.filter(r =>
                allowed_domains.some(d => r.url.includes(d))
            );
        }

        if (blocked_domains.length > 0) {
            filteredResults = filteredResults.filter(r =>
                !blocked_domains.some(d => r.url.includes(d))
            );
        }

        console.log(`✅ Found ${filteredResults.length} results`);

        return {
            success: true,
            query,
            results: filteredResults.slice(0, 10), // Return max 10
            count: Math.min(filteredResults.length, 10)
        };

    } catch (error) {
        console.error('❌ Search error:', error.message);
        return {
            success: false,
            error: error.message,
            query,
            results: []
        };
    }
}

module.exports = { webSearch };
