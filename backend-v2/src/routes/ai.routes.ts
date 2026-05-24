import { Router, Request, Response } from 'express';
import { opencodeHttpService } from '../services/opencode-http.service';
import { buildPreviewContract, contractToSummary, StructuredAnswers } from '../services/product-contract';

export const aiRouter = Router();

// Helper to run commands in asyncHandler-style to match backend-v2 routing
function wrapAsync(fn: (req: Request, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: any) => {
    fn(req, res).catch(next);
  };
}

// Helper to query OpenCode with prioritised models list
async function callOpencode(prompt: string, modelOverride?: string): Promise<string> {
  // Priority chain: DeepSeek V4-Pro paid → free fallback chain.
  // OpenRouter is configured in opencode.jsonc with OPENROUTER_API_KEY in env.
  const models = modelOverride ? [modelOverride] : [
    'openrouter/deepseek/deepseek-v4-pro',
    'openrouter/deepseek/deepseek-v4-flash',
    'openrouter/qwen/qwen3-coder',
    'openrouter/google/gemma-4-31b-it:free',
    // Last-resort Zen models if OpenRouter saturated
    'opencode/big-pickle',
    'opencode/deepseek-v4-flash-free',
  ];

  const crypto = require('crypto');
  const sessionId = crypto.randomUUID();

  for (const model of models) {
    try {
      let response = '';
      const stream = opencodeHttpService.chatStream({
        sessionId,
        message: prompt,
        model,
      });

      for await (const event of stream) {
        if (event.type === 'token') {
          response += event.content;
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }

      if (response.trim().length > 5) {
        return response.trim();
      }
    } catch (err: any) {
      console.warn(`[AI Route] OpenCode model ${model} call failed:`, err?.message || err);
      opencodeHttpService.forgetSession(sessionId);
    }
  }

  throw new Error('All OpenCode models failed or returned empty response');
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
  return base.slice(0, 60) || 'Nuova Conversazione';
}

function getDefaultQuestions(lang: 'Italian' | 'English') {
  if (lang === 'Italian') {
    return [
      {
        questionId: "pages",
        question: "Quali pagine/schermate principali dovrebbe avere la tua app?",
        multiSelect: true,
        options: [
          { optionId: "home_feed", label: "🏠 Home Feed principale" },
          { optionId: "details_view", label: "🔍 Dettaglio contenuto" },
          { optionId: "profile_settings", label: "👤 Profilo e Impostazioni" },
          { optionId: "creation_wizard", label: "➕ Schermata di Creazione" }
        ]
      },
      {
        questionId: "main_feature",
        question: "Qual è la funzionalità principale (la stella dell'app)?",
        multiSelect: true,
        options: [
          { optionId: "search_filters", label: "🔍 Ricerca e Filtri avanzati" },
          { optionId: "realtime_feed", label: "⚡ Feed dinamico in tempo reale" },
          { optionId: "interactive_dashboard", label: "📊 Dashboard interattiva" }
        ]
      },
      {
        questionId: "visual_style",
        question: "Quale stile grafico preferisci per il design?",
        multiSelect: true,
        options: [
          { optionId: "dark_minimal", label: "🌑 Dark & Minimal" },
          { optionId: "colorful_playful", label: "🎨 Colorful & Playful" },
          { optionId: "glassmorphism", label: "✨ Glassmorphism & Sfumature" },
          { optionId: "clean_modern", label: "📰 Pulito & Moderno" }
        ]
      },
      {
        questionId: "extra_touch",
        question: "Quale tocco di classe finale vorresti aggiungere?",
        multiSelect: true,
        options: [
          { optionId: "smooth_animations", label: "💫 Animazioni fluide" },
          { optionId: "haptics_gestures", label: "👋 Gesture e Haptic feedback" },
          { optionId: "badges_rewards", label: "🏷️ Badge e Gamification" }
        ]
      }
    ];
  } else {
    return [
      {
        questionId: "pages",
        question: "Which main screens/pages should your app have?",
        multiSelect: true,
        options: [
          { optionId: "home_feed", label: "🏠 Home Feed" },
          { optionId: "details_view", label: "🔍 Content Details" },
          { optionId: "profile_settings", label: "👤 Profile & Settings" },
          { optionId: "creation_wizard", label: "➕ Creation Screen" }
        ]
      },
      {
        questionId: "main_feature",
        question: "What is the ONE feature that should be the star of the app?",
        multiSelect: true,
        options: [
          { optionId: "search_filters", label: "🔍 Advanced Search & Filters" },
          { optionId: "realtime_feed", label: "⚡ Dynamic Real-time Feed" },
          { optionId: "interactive_dashboard", label: "📊 Interactive Dashboard" }
        ]
      },
      {
        questionId: "visual_style",
        question: "What visual style do you prefer for the design?",
        multiSelect: true,
        options: [
          { optionId: "dark_minimal", label: "🌑 Dark & Minimal" },
          { optionId: "colorful_playful", label: "🎨 Colorful & Playful" },
          { optionId: "glassmorphism", label: "✨ Glassmorphism & Gradients" },
          { optionId: "clean_modern", label: "📰 Clean & Modern" }
        ]
      },
      {
        questionId: "extra_touch",
        question: "What extra detail would make this app special?",
        multiSelect: true,
        options: [
          { optionId: "smooth_animations", label: "💫 Smooth animations" },
          { optionId: "haptics_gestures", label: "👋 Swipe gestures & Haptics" },
          { optionId: "badges_rewards", label: "🏷️ Badge rewards" }
        ]
      }
    ];
  }
}

/**
 * POST /ai/chat
 * Streaming chat endpoint used by legacy normal chat flow (non-agent mode)
 */
aiRouter.post('/chat', wrapAsync(async (req: Request, res: Response) => {
  const { prompt, selectedModel, projectId, userId } = req.body || {};

  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const model = selectedModel || 'openrouter/deepseek/deepseek-v4-pro';

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.socket?.setNoDelay(true);
  res.write(': connected\n\n');

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, 10000);

  // Cache-friendly session key: reuse the same opencode session for the same
  // (project, user). DeepSeek V4-Pro caches identical prefixes — same session
  // means the system prompt + conversation history are reused, so input
  // tokens are billed at ~$0.0036/M (cache hit) instead of $0.435/M (cache
  // miss). A fresh UUID per request invalidates every cache and is what was
  // costing us the bulk of the OpenRouter spend.
  const sessionId = String(projectId || `user-${userId || 'anonymous'}`);

  try {
    const stream = opencodeHttpService.chatStream({
      sessionId,
      message: String(prompt),
      model,
    });

    for await (const event of stream) {
      if (res.writableEnded) break;

      if (event.type === 'token' && event.content) {
        res.write(`data: ${JSON.stringify({ text: event.content })}\n\n`);
      } else if (event.type === 'error') {
        throw new Error(event.message);
      }
    }

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
    }
  } catch (error: any) {
    console.error('[AI] /chat streaming error:', error);
    if (!res.writableEnded) {
      const errorMessage = error?.message || 'AI chat failed';
      res.write(`data: ${JSON.stringify({ error: errorMessage, text: `Errore AI: ${errorMessage}` })}\n\n`);
    }
  } finally {
    clearInterval(heartbeat);
    // Note: NO forgetSession() here — we deliberately keep the opencode
    // sessionId mapping alive so the next request for the same (project,
    // user) hits the same opencode session and benefits from DeepSeek's
    // prefix cache.
    if (!res.writableEnded) {
      res.end();
    }
  }
}));

/**
 * POST /ai/chat/generate-title
 * Generates a short title for a conversation.
 */
aiRouter.post('/chat/generate-title', wrapAsync(async (req: Request, res: Response) => {
  const { message } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const prompt = `Genera un titolo breve (max 7 parole) per questa chat.
Rispondi SOLO con il titolo, senza virgolette o markdown.
Testo: "${String(message).slice(0, 800)}"`;

  try {
    const rawTitle = await callOpencode(prompt);
    const title = sanitizeTitle(rawTitle, message);
    res.json({ success: true, title });
  } catch (error: any) {
    console.error('[AI] title generation error:', error);
    const fallbackTitle = sanitizeTitle(message, message);
    res.json({ success: true, title: fallbackTitle });
  }
}));

/**
 * POST /ai/recommend
 * AI-powered technology recommendation based on project description
 */
aiRouter.post('/recommend', wrapAsync(async (req: Request, res: Response) => {
  const { description, language } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'description is required' });
  }

  const lang = language?.startsWith('it') ? 'Italian' : 'English';
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

  const validTechs = ['react', 'nextjs', 'vue', 'nuxt', 'svelte', 'angular', 'astro', 'remix', 'solid', 'html', 'flask', 'django', 'fastapi', 'expo', 'flutter', 'laravel'];
  let finalRecommendation: string | undefined;
  let explanation = '';

  try {
    const response = await callOpencode(prompt);
    try {
      const parsed = JSON.parse(response.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
      const rec = String(parsed.recommendation || '').trim().toLowerCase().replace(/[^a-z]/g, '');
      finalRecommendation = validTechs.find(tech => rec === tech) || validTechs.find(tech => rec.includes(tech));
      explanation = String(parsed.explanation || '').trim();
    } catch {
      const recommendation = response.trim().toLowerCase().replace(/[^a-z]/g, '');
      finalRecommendation = validTechs.find(tech => recommendation === tech) || validTechs.find(tech => recommendation.includes(tech));
    }
  } catch (error) {
    console.warn('[AI] Recommendation request failed, using deterministic parsing:', error);
  }

  // Fallbacks if AI recommendation parsing fails or is empty
  if (!finalRecommendation) {
    const desc = description.toLowerCase();
    const techKeywords: Record<string, string> = {
      flask: 'flask', django: 'django', fastapi: 'fastapi',
      'next.js': 'nextjs', nextjs: 'nextjs', nuxt: 'nuxt',
      svelte: 'svelte', angular: 'angular', solid: 'solid',
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

  res.json({
    success: true,
    recommendation: finalRecommendation,
    explanation: explanation || undefined
  });
}));

/**
 * POST /ai/project-questions
 * AI generates targeted questions about the project idea
 */
aiRouter.post('/project-questions', wrapAsync(async (req: Request, res: Response) => {
  const { description, technology, language } = req.body;
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'description is required' });
  }

  const techLabel = technology || 'web';
  const lang = language?.startsWith('it') ? 'Italian' : 'English';

  const prompt = `The user wants to create a ${techLabel} project: "${description}"

Generate exactly 4 questions to customize the app. Each question must be highly specific to this exact app idea — NOT generic.

REQUIRED QUESTIONS (use these exact questionIds):

1. questionId: "pages"
   Purpose: Which screens/pages should the app have?
   Generate exactly 4 options, each representing a specific screen the user would expect from "${description}".
   Each option label must start with an emoji that represents that screen.
   multiSelect: true

2. questionId: "main_feature"
   Purpose: What is the ONE feature that should be the star of the app?
   Generate exactly 3 options, each describing a specific standout feature unique to this type of app.
   Each option label must start with an emoji.
   multiSelect: true

3. questionId: "visual_style"
   Purpose: What look and feel?
   Generate exactly 4 options with emoji, each representing a distinct visual direction specific to this app type.
   multiSelect: true

4. questionId: "extra_touch"
   Purpose: What extra detail would make this app special?
   Generate exactly 3 options with emoji — small details that would delight the user.
   multiSelect: true

Rules:
- MAXIMUM 4 options per question. Never more.
- Write question text and ALL option labels in ${lang}
- optionIds must be in English, lowercase, with underscores (e.g. "swipe_gesture", "dark_bold")
- Option labels: emoji + short text (max 4 words after emoji)
- Questions must feel fun and easy to answer, not technical
- NEVER use words like "mock", "database", "API", "auth" — these are internal implementation details

Return ONLY valid JSON array:
[{"questionId":"pages","question":"...","multiSelect":true,"options":[{"optionId":"home_feed","label":"🏠 Home feed"},...]},...]`;

  try {
    const response = await callOpencode(prompt);
    let clean = response.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    if (!clean.endsWith(']')) {
      const lastComplete = clean.lastIndexOf('}');
      if (lastComplete > 0) clean = clean.substring(0, lastComplete + 1) + ']';
    }

    const questions = JSON.parse(clean);
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid questions format');
    }

    // Enforce options limits
    for (const q of questions) {
      if (Array.isArray(q.options) && q.options.length > 4) {
        q.options = q.options.slice(0, 4);
      }
    }

    res.json({ success: true, questions });
  } catch (error: any) {
    console.error('[AI] Project questions error, using defaults:', error.message || error);
    res.json({ success: true, questions: getDefaultQuestions(lang) });
  }
}));

/**
 * POST /ai/preview-contract
 */
aiRouter.post('/preview-contract', (req: Request, res: Response) => {
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
});
