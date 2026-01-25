/**
 * WebSearch Tool
 * Search the web using DuckDuckGo (Free, no API key required)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const metricsService = require('../metrics-service');

/**
 * Search the web for information using DuckDuckGo (100% Free)
 * @param {string} query - Search query
 * @param {string[]} allowed_domains - Only include results from these domains
 * @param {string[]} blocked_domains - Never include results from these domains
 * @returns {Promise<Object>} Search results
 */
async function webSearch(query, allowed_domains = [], blocked_domains = [], projectId = 'global') {
    try {
        console.log(`🌐 Searching web for: "${query}" (Project: ${projectId})`);

        // Track search usage
        metricsService.trackSearch(projectId).catch(e => console.warn('Failed to track search:', e.message));

        let results = [];

        // DuckDuckGo HTML Scraping (Free, no API key needed)
        console.log('🔍 Using DuckDuckGo HTML Scraping (Free)');

        try {
            const ddgResponse = await axios.get('https://html.duckduckgo.com/html/', {
                params: {
                    q: query,
                    kl: 'us-en' // US English results
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                },
                timeout: 10000
            });

            // Parse HTML results using cheerio
            const $ = cheerio.load(ddgResponse.data);

            // DuckDuckGo HTML results are in .result elements
            $('.result').each((index, element) => {
                if (index >= 10) return false; // Max 10 results

                const titleEl = $(element).find('.result__a');
                const snippetEl = $(element).find('.result__snippet');
                const urlEl = $(element).find('.result__url');

                const title = titleEl.text().trim();
                let url = titleEl.attr('href') || '';
                const snippet = snippetEl.text().trim();

                // DuckDuckGo wraps URLs, need to extract actual URL
                if (url.includes('uddg=')) {
                    try {
                        const uddgMatch = url.match(/uddg=([^&]+)/);
                        if (uddgMatch) {
                            url = decodeURIComponent(uddgMatch[1]);
                        }
                    } catch (e) {
                        // Use URL element as fallback
                        url = 'https://' + urlEl.text().trim();
                    }
                }

                if (title && url && !url.includes('duckduckgo.com')) {
                    results.push({
                        title: title,
                        url: url,
                        snippet: snippet || title
                    });
                }
            });

            console.log(`📄 DuckDuckGo HTML returned ${results.length} results`);
        } catch (ddgError) {
            console.log('⚠️ DuckDuckGo HTML scraping failed:', ddgError.message);
        }

        // Fallback: DuckDuckGo Instant Answer API if HTML scraping failed
        if (results.length === 0) {
            console.log('🔍 Trying DuckDuckGo Instant Answer API...');
            try {
                const instantResponse = await axios.get('https://api.duckduckgo.com/', {
                    params: {
                        q: query,
                        format: 'json',
                        no_html: 1,
                        skip_disambig: 1
                    },
                    timeout: 10000
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
            } catch (instantError) {
                console.log('⚠️ DuckDuckGo Instant Answer failed:', instantError.message);
            }
        }

        // Last resort: Wikipedia API for factual queries
        if (results.length === 0) {
            const factualKeywords = ['when', 'what', 'who', 'where', 'why', 'how', 'quando', 'cosa', 'chi', 'dove', 'perché', 'come'];
            const isFactual = factualKeywords.some(kw => query.toLowerCase().includes(kw));

            if (isFactual) {
                console.log('🔍 Trying Wikipedia API...');
                try {
                    let wikiQuery = query
                        .toLowerCase()
                        .replace(/quando|when|what|who|where|why|how|cosa|chi|dove|perch[eé]|come/gi, '')
                        .replace(/è stata fondata|was founded|foundation|founding|created|started/gi, '')
                        .trim();

                    const wikiResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
                        params: {
                            action: 'opensearch',
                            search: wikiQuery,
                            limit: 5,
                            format: 'json'
                        },
                        timeout: 10000
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
                    console.log('⚠️ Wikipedia API failed:', wikiError.message);
                }
            }
        }

        if (results.length === 0) {
            console.log('⚠️ All search methods failed, returning 0 results');
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
            results: filteredResults.slice(0, 10),
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
