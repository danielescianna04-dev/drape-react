import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { aiProviderService, ChatMessage } from '../services/ai-provider.service';
import { log } from '../utils/logger';

export const aiRouter = Router();

function normalizeModel(model: string | undefined): string {
  if (!model) return 'gemini-3-flash';
  const aliases: Record<string, string> = {
    'gemini-3-0-pro': 'gemini-3.1-pro',
    'gemini-3-pro': 'gemini-3.1-pro',
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
  res.socket?.setNoDelay(true);

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
  for await (const chunk of aiProviderService.chatStream('gemini-3-flash', [
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
    const { description, language } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }

    const lang = language?.startsWith('it') ? 'Italian' : 'English';
    log.info(`[AI] Recommendation request for: ${description.substring(0, 50)}... (lang: ${lang})`);
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

Respond with a JSON object with two fields:
- "recommendation": the technology ID (e.g., "react", "nextjs", "html")
- "explanation": a brief one-sentence explanation of why this technology is the best fit (max 15 words). Write the explanation in ${lang}.

Respond ONLY with the JSON object, no markdown.`;

    const messages = [{ role: 'user' as const, content: prompt }];

    let response = '';
    const recModels = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3-flash'];
    for (const model of recModels) {
      try {
        response = '';
        for await (const chunk of aiProviderService.chatStream(model, messages, undefined, undefined, { thinkingLevel: 'none', maxTokens: 100 })) {
          if (chunk.type === 'text' && chunk.text) response += chunk.text;
        }
        if (response.trim().length > 5) break;
      } catch (modelErr: any) {
        log.warn(`[AI] Recommend model ${model} failed: ${modelErr.message?.substring(0, 80)}`);
        continue;
      }
    }

    // Valid tech IDs matching the frontend
    const validTechs = ['react', 'nextjs', 'vue', 'nuxt', 'svelte', 'angular', 'astro', 'remix', 'solid', 'html', 'flask', 'django', 'fastapi', 'expo', 'flutter', 'laravel'];

    // Try to parse JSON response with recommendation + explanation
    let finalRecommendation: string | undefined;
    let explanation = '';
    try {
      const parsed = JSON.parse(response.trim());
      const rec = String(parsed.recommendation || '').trim().toLowerCase().replace(/[^a-z]/g, '');
      finalRecommendation = validTechs.find(tech => rec === tech) || validTechs.find(tech => rec.includes(tech));
      explanation = String(parsed.explanation || '').trim();
    } catch {
      // Fallback: treat entire response as tech ID (backwards compatible)
      const recommendation = response.trim().toLowerCase().replace(/[^a-z]/g, '');
      finalRecommendation = validTechs.find(tech => recommendation === tech) || validTechs.find(tech => recommendation.includes(tech));
    }

    if (!finalRecommendation) {
      const desc = description.toLowerCase();
      // Keyword-based fallback for explicit technology mentions
      const techKeywords: Record<string, string> = {
        flask: 'flask', django: 'django', fastapi: 'fastapi',
        'next.js': 'nextjs', nextjs: 'nextjs', nuxt: 'nuxt',
        svelte: 'svelte', angular: 'angular', 'solid': 'solid',
        vue: 'vue', react: 'react', astro: 'astro', remix: 'remix',
        flutter: 'flutter', expo: 'expo', laravel: 'laravel',
        python: 'flask', php: 'laravel',
      };
      for (const [keyword, tech] of Object.entries(techKeywords)) {
        if (desc.includes(keyword)) { finalRecommendation = tech; break; }
      }
      if (!finalRecommendation) {
        if (desc.includes('landing') || desc.includes('static') || desc.includes('semplice')) {
          finalRecommendation = 'html';
        } else if (desc.includes('mobile') || desc.includes('app nativa')) {
          finalRecommendation = 'expo';
        } else {
          finalRecommendation = 'react';
        }
      }
    }

    log.info(`[AI] Recommended: ${finalRecommendation}`);

    res.json({
      success: true,
      recommendation: finalRecommendation,
      explanation: explanation || undefined,
      rawResponse: response
    });
  } catch (error: any) {
    log.error('[AI] Recommendation error:', error);
    res.status(500).json({ error: 'AI recommendation failed' });
  }
}));

// ── Project Questions — AI generates targeted questions about the project idea ──
aiRouter.post('/project-questions', asyncHandler(async (req: Request, res: Response) => {
  const { description, technology, language } = req.body;
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'description is required' });
  }

  try {
    const techLabel = technology || 'web';
    const lang = language?.startsWith('it') ? 'Italian' : 'English';
    const prompt = `The user wants to create a ${techLabel} project: "${description}"

Generate exactly 4 product-oriented questions with stable IDs. These help define the V1 scope.

REQUIRED QUESTIONS (use these exact questionIds):

1. questionId: "core_flows"
   Purpose: Which core experiences should the V1 include?
   Generate 4-5 options specific to "${description}", each with a short stable optionId (lowercase, underscores).
   multiSelect: true

2. questionId: "key_interaction"
   Purpose: What's the most important interaction?
   Generate 3-4 options specific to the app type, each with a stable optionId.
   multiSelect: false

3. questionId: "data_mode"
   Purpose: How should data and accounts work?
   Use these EXACT options:
   - optionId: "mock_no_login", label: "Mock data, no login"
   - optionId: "mock_with_login", label: "Mock data with login"
   - optionId: "real_db_auth", label: "Real database + auth"
   multiSelect: false

4. questionId: "visual_style"
   Purpose: What visual style fits?
   Generate 3-4 style options specific to the app type, each with a stable optionId.
   multiSelect: false

Rules:
- Write question text and option labels in ${lang}
- optionIds must be in English, lowercase, with underscores (e.g. "swipe_gesture", "dark_bold")
- Keep labels short (max 5 words)

Return ONLY valid JSON array:
[{"questionId":"core_flows","question":"...","multiSelect":true,"options":[{"optionId":"discover","label":"..."},...]},...]`;

    let response = '';
    const models = ['gemini-3-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
    for (const model of models) {
      try {
        response = '';
        for await (const chunk of aiProviderService.chatStream(model, [{ role: 'user', content: prompt }], undefined, 'Return ONLY valid JSON array. No markdown.', { thinkingLevel: 'none', maxTokens: 2000 })) {
          if (chunk.type === 'text' && chunk.text) response += chunk.text;
        }
        if (response.trim().length > 10) break; // Got a response, stop trying
      } catch (modelErr: any) {
        log.warn(`[AI] Questions model ${model} failed: ${modelErr.message?.substring(0, 80)}`);
        continue;
      }
    }

    log.info(`[AI] Raw questions response (${response.length} chars): ${response.substring(0, 200)}`);
    let clean = response.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    // Try to recover truncated JSON
    if (!clean.endsWith(']')) {
      const lastComplete = clean.lastIndexOf('}');
      if (lastComplete > 0) clean = clean.substring(0, lastComplete + 1) + ']';
    }
    const questions = JSON.parse(clean);

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid questions format');
    }

    log.info(`[AI] Generated ${questions.length} project questions for "${description}"`);
    res.json({ success: true, questions });
  } catch (error: any) {
    log.error('[AI] Project questions error:', error.message);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
}));

// ── Preview Contract — deterministic, no AI ────────────────────────────────
import { buildPreviewContract, contractToSummary, StructuredAnswers } from '../services/product-contract';

aiRouter.post('/preview-contract', asyncHandler(async (req: Request, res: Response) => {
  const { description, technology, projectName, answers } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const contract = buildPreviewContract(
    projectName || 'My Project',
    description,
    technology || 'nextjs',
    (answers || {}) as StructuredAnswers,
  );
  const summary = contractToSummary(contract);

  res.json({ success: true, contract, summary });
}));
