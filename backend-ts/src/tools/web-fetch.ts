import axios from 'axios';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { vercelChatSimple } from '../services/ai-providers';
import { log } from '../utils/logger';
import { ToolResult } from '../types';

/**
 * Fetch a URL, convert HTML to markdown, and extract specific information using AI.
 */
export async function webFetch(url: string, prompt: string): Promise<ToolResult> {
  if (!url) {
    return { success: false, content: 'url is required' };
  }
  if (!prompt) {
    return { success: false, content: 'prompt is required' };
  }

  // Ensure URL has protocol
  let normalizedUrl = url;
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    // 1. Fetch the URL
    const response = await axios.get(normalizedUrl, {
      timeout: 15000,
      maxContentLength: 5 * 1024 * 1024, // 5MB max
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DrapeBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      responseType: 'text',
    });

    const html = response.data;

    if (typeof html !== 'string' || html.trim().length === 0) {
      return { success: false, content: 'Empty response from URL' };
    }

    // 2. Parse with JSDOM and clean up
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Remove non-content elements
    const removeSelectors = ['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript'];
    for (const selector of removeSelectors) {
      document.querySelectorAll(selector).forEach((el: any) => el.remove());
    }

    // 3. Convert to markdown
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    let markdown = turndown.turndown(document.body?.innerHTML || '');

    // 4. Truncate to ~50K chars
    const MAX_CONTENT = 50000;
    if (markdown.length > MAX_CONTENT) {
      markdown = markdown.substring(0, MAX_CONTENT) + '\n\n[Content truncated...]';
    }

    // 5. Extract information using Haiku
    const extracted = await vercelChatSimple(
      [{ role: 'user', content: `Extract the following information from this web page content. Be concise and focused.\n\nRequest: ${prompt}\n\nPage URL: ${normalizedUrl}\n\nPage content:\n${markdown}` }],
      'You are a web page content extractor. Extract the requested information accurately and concisely.',
    );

    return {
      success: true,
      content: extracted || markdown.substring(0, 2000),
    };
  } catch (error: any) {
    log.error(`[WebFetch] Failed to fetch ${normalizedUrl}: ${error.message}`);

    if (error.code === 'ECONNABORTED') {
      return { success: false, content: `Timeout fetching ${normalizedUrl} (15s limit)` };
    }
    if (error.response?.status) {
      return { success: false, content: `HTTP ${error.response.status} from ${normalizedUrl}` };
    }
    return { success: false, content: `Failed to fetch URL: ${error.message}` };
  }
}
