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
            // Fallback to Brave Search API (Zero-Config)
            console.log('🔍 Using Brave Search API (Zero-Config Fallback)');

            try {
                // Use Brave's free search suggestions API (no key needed)
                const braveResponse = await axios.get('https://search.brave.com/api/suggest', {
                    params: {
                        q: query
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 5000
                });

                // Parse suggestions
                if (Array.isArray(braveResponse.data) && braveResponse.data[1]) {
                    const suggestions = braveResponse.data[1];
                    const urls = braveResponse.data[3] || [];

                    for (let i = 0; i < Math.min(suggestions.length, 5); i++) {
                        if (suggestions[i]) {
                            results.push({
                                title: suggestions[i],
                                url: urls[i] || `https://search.brave.com/search?q=${encodeURIComponent(suggestions[i])}`,
                                snippet: suggestions[i]
                            });
                        }
                    }
                }
            } catch (braveError) {
                console.log('⚠️ Brave API failed, trying DuckDuckGo...');
            }

            // Fallback to DuckDuckGo Instant Answer if Brave failed
            if (results.length === 0) {
                const instantResponse = await axios.get('https://api.duckduckgo.com/', {
                    params: {
                        q: query,
                        format: 'json',
                        no_html: 1,
                        skip_disambig: 1
                    }
                });

                // Add instant answer if available
                if (instantResponse.data.AbstractText) {
                    results.push({
                        title: instantResponse.data.Heading || query,
                        url: instantResponse.data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                        snippet: instantResponse.data.AbstractText
                    });
                }

                // Add related topics
                if (instantResponse.data.RelatedTopics) {
                    for (const topic of instantResponse.data.RelatedTopics.slice(0, 9)) {
                        if (topic.FirstURL && topic.Text) {
                            results.push({
                                title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 60),
                                url: topic.FirstURL,
                                snippet: topic.Text
                            });
                        }
                    }
                }
            }

            // Last resort: Use Wikipedia API for factual queries
            if (results.length === 0 && (query.toLowerCase().includes('when') || query.toLowerCase().includes('what') || query.toLowerCase().includes('who') || query.toLowerCase().includes('quando') || query.toLowerCase().includes('cosa') || query.toLowerCase().includes('chi'))) {
                console.log('🔍 Trying Wikipedia API...');
                try {
                    // Clean query for Wikipedia - extract main subject
                    let wikiQuery = query
                        .toLowerCase()
                        .replace(/quando|when|what|who|where|why|how|cosa|chi|dove|perch[eé]|come/gi, '')
                        .replace(/è stata fondata|was founded|foundation|founding|created|started/gi, '')
                        .trim();

                    console.log(`📚 Wikipedia query: "${wikiQuery}"`);

                    const wikiResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'opensearch',
                            search: wikiQuery,
                            limit: 5,
                            format: 'json'
                        }
                    });

                    if (wikiResponse.data && wikiResponse.data[1]) {
                        const titles = wikiResponse.data[1];
                        const snippets = wikiResponse.data[2];
                        const urls = wikiResponse.data[3];

                        for (let i = 0; i < titles.length; i++) {
                            results.push({
                                title: titles[i],
                                url: urls[i],
                                snippet: snippets[i] || `Wikipedia article about ${titles[i]}`
                            });
                        }
                    }
                } catch (wikiError) {
                    console.log('⚠️ Wikipedia API failed');
                }
            }

            // If absolutely no results, return empty (let the agent handle it)
            if (results.length === 0) {
                console.log('⚠️ All search methods failed, returning 0 results');
            }
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
