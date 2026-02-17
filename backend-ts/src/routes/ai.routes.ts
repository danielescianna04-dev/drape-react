import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { aiProviderService, ChatMessage } from '../services/ai-provider.service';
import { log } from '../utils/logger';

export const aiRouter = Router();

function normalizeModel(model: string | undefined): string {
  if (!model) return 'claude-4-5-sonnet';
  const aliases: Record<string, string> = {
    'gemini-3-0-pro': 'gemini-3-pro',
    'gemini-3-0-flash': 'gemini-3-flash',
  };
  return aliases[model] || model;
}

function toChatMessages(history: any): ChatMessage[] {
  if (!Array.isArray(history)) return [];

  return history.reduce<ChatMessage[]>((acc, m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system')) {
      return acc;
    }

    const content = String(m.content ?? '').trim();
    if (!content) {
      return acc;
    }

    acc.push({
      role: m.role,
      content,
    });

    return acc;
  }, []);
}

function sanitizeTitle(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[*`"#]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (cleaned.length >= 3) {
    return cleaned.slice(0, 60);
  }

  const base = String(fallback || 'Nuova Conversazione').trim();
  if (!base) return 'Nuova Conversazione';
  return base.slice(0, 60);
}

/**
 * POST /ai/chat
 * Streaming chat endpoint used by legacy normal chat flow (non-agent mode)
 */
aiRouter.post('/chat', asyncHandler(async (req: Request, res: Response) => {
  const { prompt, selectedModel, conversationHistory, thinkingLevel } = req.body || {};

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const model = normalizeModel(selectedModel);
  const messages: ChatMessage[] = [
    ...toChatMessages(conversationHistory),
    { role: 'user', content: String(prompt) },
  ];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Initial event to flush headers in proxies
  res.write(': connected\n\n');

  try {
    for await (const chunk of aiProviderService.chatStream(
      model,
      messages,
      undefined,
      undefined,
      { temperature: 0.6, thinkingLevel: thinkingLevel || null }
    )) {
      if (res.writableEnded) break;

      if (chunk.type === 'thinking_start') {
        res.write(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`);
      } else if (chunk.type === 'thinking') {
        res.write(`data: ${JSON.stringify({ type: 'thinking', text: chunk.text })}\n\n`);
      } else if (chunk.type === 'thinking_end') {
        res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`);
      } else if (chunk.type === 'text' && chunk.text) {
        res.write(`data: ${JSON.stringify({ type: 'text', text: chunk.text })}\n\n`);
      }
    }

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
    }
  } catch (error: any) {
    log.error('[AI] /chat streaming error:', error);
    if (!res.writableEnded) {
      const errorMessage = error?.message || 'AI chat failed';
      const payload = { error: errorMessage, text: `Errore AI: ${errorMessage}` };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}));

/**
 * POST /ai/chat/generate-title
 * Generates a short title for a conversation.
 */
aiRouter.post('/chat/generate-title', asyncHandler(async (req: Request, res: Response) => {
  const { message } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const prompt = `Genera un titolo breve (max 7 parole) per questa chat.
Rispondi SOLO con il titolo, senza virgolette.
Testo: "${String(message).slice(0, 800)}"`;

  let rawTitle = '';
  for await (const chunk of aiProviderService.chatStream('claude-haiku-3.5', [
    { role: 'user', content: prompt },
  ], undefined, undefined, { temperature: 0.2, maxTokens: 40 })) {
    if (chunk.type === 'text' && chunk.text) {
      rawTitle += chunk.text;
    }
  }

  const title = sanitizeTitle(rawTitle, message);
  res.json({ success: true, title });
}));

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
