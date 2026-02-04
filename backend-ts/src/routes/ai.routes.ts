import { Router, Request, Response } from 'express';
import { aiProviderService } from '../services/ai-provider.service';
import { log } from '../utils/logger';

export const aiRouter = Router();

/**
 * POST /ai/recommend
 * AI-powered technology recommendation based on project description
 */
aiRouter.post('/recommend', async (req: Request, res: Response) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }

    log.info(`[AI] Recommendation request for: ${description.substring(0, 50)}...`);

    const prompt = `Based on this project description, recommend the BEST technology stack from this list:
- javascript: Pure JavaScript for simple interactive sites
- typescript: TypeScript for type-safe applications
- python: Python for data science, ML, automation, backend
- react: React for modern single-page applications
- node: Node.js for backend APIs and servers
- cpp: C++ for high-performance systems
- java: Java for enterprise applications
- swift: Swift for iOS applications
- kotlin: Kotlin for Android applications
- go: Go for scalable backend services
- rust: Rust for systems programming
- html: HTML/CSS for simple static websites

Project description: "${description}"

Respond with ONLY the technology ID (e.g., "react", "python", "html") - nothing else. Choose the most appropriate one based on:
1. Project complexity (simple static sites = html, complex apps = react/python)
2. Type of application (web app, mobile, backend, data science)
3. Scalability needs
4. Modern best practices`;

    const messages = [{ role: 'user' as const, content: prompt }];

    let response = '';
    for await (const chunk of aiProviderService.chatStream('gemini-3-flash', messages)) {
      if (chunk.type === 'text' && chunk.text) {
        response += chunk.text;
      }
    }

    // Clean up response - extract just the tech ID
    const recommendation = response.trim().toLowerCase();

    // Valid tech IDs from the list
    const validTechs = ['javascript', 'typescript', 'python', 'react', 'node', 'cpp', 'java', 'swift', 'kotlin', 'go', 'rust', 'html'];

    // Find the first valid tech in the response
    let finalRecommendation = validTechs.find(tech => recommendation.includes(tech));

    if (!finalRecommendation) {
      // Default fallback based on keywords
      if (description.toLowerCase().includes('landing') || description.toLowerCase().includes('semplice') || description.toLowerCase().includes('static')) {
        finalRecommendation = 'html';
      } else if (description.toLowerCase().includes('app') || description.toLowerCase().includes('web')) {
        finalRecommendation = 'react';
      } else {
        finalRecommendation = 'javascript';
      }
    }

    log.info(`[AI] Recommended: ${finalRecommendation}`);

    res.json({
      success: true,
      recommendation: finalRecommendation,
      rawResponse: response
    });
  } catch (error: any) {
    log.error('[AI] Recommendation error:', error.message);
    res.status(500).json({ error: 'AI recommendation failed', message: error.message });
  }
});
