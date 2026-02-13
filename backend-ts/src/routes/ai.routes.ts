import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { aiProviderService } from '../services/ai-provider.service';
import { log } from '../utils/logger';

export const aiRouter = Router();

/**
 * POST /ai/recommend
 * AI-powered technology recommendation based on project description
 */
aiRouter.post('/recommend', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }

    log.info(`[AI] Recommendation request for: ${description.substring(0, 50)}...`);

    const prompt = `Based on this project description, recommend the BEST technology from this list:
- react: React SPA
- nextjs: Next.js (SSR/SSG, full-stack React)
- vue: Vue.js SPA
- nuxt: Nuxt.js (SSR/SSG, full-stack Vue)
- svelte: Svelte/SvelteKit
- angular: Angular
- astro: Astro (content-focused, static sites)
- remix: Remix (full-stack React)
- solid: Solid.js
- html: HTML/CSS/JS (simple static sites)
- flask: Flask (Python backend)
- django: Django (Python full-stack)
- fastapi: FastAPI (Python API)
- expo: React Native / Expo (mobile apps)
- flutter: Flutter (cross-platform mobile)
- laravel: Laravel (PHP full-stack)

Project description: "${description}"

Respond with ONLY the technology ID (e.g., "react", "nextjs", "html") - nothing else.`;

    const messages = [{ role: 'user' as const, content: prompt }];

    let response = '';
    for await (const chunk of aiProviderService.chatStream('claude-haiku-3.5', messages)) {
      if (chunk.type === 'text' && chunk.text) {
        response += chunk.text;
      }
    }

    // Clean up response - extract just the tech ID
    const recommendation = response.trim().toLowerCase().replace(/[^a-z]/g, '');

    // Valid tech IDs matching the frontend
    const validTechs = ['react', 'nextjs', 'vue', 'nuxt', 'svelte', 'angular', 'astro', 'remix', 'solid', 'html', 'flask', 'django', 'fastapi', 'expo', 'flutter', 'laravel'];

    let finalRecommendation = validTechs.find(tech => recommendation === tech) || validTechs.find(tech => recommendation.includes(tech));

    if (!finalRecommendation) {
      if (description.toLowerCase().includes('landing') || description.toLowerCase().includes('static') || description.toLowerCase().includes('semplice')) {
        finalRecommendation = 'html';
      } else if (description.toLowerCase().includes('mobile') || description.toLowerCase().includes('app nativa')) {
        finalRecommendation = 'expo';
      } else {
        finalRecommendation = 'react';
      }
    }

    log.info(`[AI] Recommended: ${finalRecommendation}`);

    res.json({
      success: true,
      recommendation: finalRecommendation,
      rawResponse: response
    });
  } catch (error: any) {
    log.error('[AI] Recommendation error:', error);
    res.status(500).json({ error: 'AI recommendation failed' });
  }
}));
