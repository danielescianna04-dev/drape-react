const express = require('express');
const router = express.Router();

/**
 * AI Chat Routes
 * Supporta: OpenAI (GPT-4), Anthropic (Claude), Google (Gemini)
 */

// POST /ai/chat - Chat con AI
router.post('/chat', async (req, res) => {
  const { prompt, model = 'gemini', workstationId, context } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const aiAgent = req.app.get('aiAgent');
    
    if (!aiAgent || !aiAgent.isAvailable()) {
      return res.status(503).json({ 
        error: 'AI service not available. Please configure API keys in .env' 
      });
    }

    // Costruisci il prompt con contesto
    let fullPrompt = prompt;
    if (context) {
      fullPrompt = `Project: ${context.projectName || 'Unknown'}
Language: ${context.language || 'Unknown'}
Repository: ${context.repositoryUrl || 'None'}

User request: ${prompt}`;
    }

    let response;
    const startTime = Date.now();

    // Seleziona provider in base al modello richiesto
    if (model.includes('gpt') || model.includes('openai')) {
      response = await handleOpenAI(aiAgent, fullPrompt, model);
    } else if (model.includes('claude') || model.includes('anthropic')) {
      response = await handleClaude(aiAgent, fullPrompt, model);
    } else if (model.includes('gemini') || model.includes('google')) {
      response = await handleGemini(aiAgent, fullPrompt, model);
    } else {
      // Default: prova Gemini, poi Claude, poi GPT
      response = await handleAnyAvailable(aiAgent, fullPrompt);
    }

    const executionTime = Date.now() - startTime;

    res.json({
      content: response,
      model: model,
      executionTime,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({ 
      error: error.message || 'AI request failed',
      details: error.toString()
    });
  }
});

// POST /ai/agent - Esecuzione autonoma con AI Agent
router.post('/agent', async (req, res) => {
  const { task, model = 'gemini', workstationId, autoApprove = false } = req.body;

  if (!task) {
    return res.status(400).json({ error: 'Task is required' });
  }

  try {
    const aiAgent = req.app.get('aiAgent');
    
    if (!aiAgent || !aiAgent.isAvailable()) {
      return res.status(503).json({ 
        error: 'AI Agent not available' 
      });
    }

    // Esegui task con AI Agent
    const result = await aiAgent.executeTask(task, {
      sessionId: workstationId,
      autoApprove,
      maxIterations: 10,
    });

    res.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('AI Agent error:', error);
    res.status(500).json({ 
      error: error.message || 'AI Agent execution failed' 
    });
  }
});

// GET /ai/models - Lista modelli disponibili
router.get('/models', (req, res) => {
  const aiAgent = req.app.get('aiAgent');
  
  if (!aiAgent) {
    return res.json({ models: [] });
  }

  const providers = aiAgent.getAvailableProviders();
  const models = [];

  if (providers.includes('openai')) {
    models.push(
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
      { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' }
    );
  }

  if (providers.includes('anthropic')) {
    models.push(
      { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic' },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic' }
    );
  }

  if (providers.includes('gemini')) {
    models.push(
      { id: 'gemini-pro', name: 'Gemini Pro', provider: 'gemini' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini' }
    );
  }

  res.json({ models, providers });
});

// Helper functions
async function handleOpenAI(aiAgent, prompt, model) {
  const openai = aiAgent.services.openai;
  if (!openai) throw new Error('OpenAI not configured');

  const completion = await openai.chat.completions.create({
    model: model.includes('gpt-4') ? 'gpt-4-turbo-preview' : 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
  });

  return completion.choices[0].message.content;
}

async function handleClaude(aiAgent, prompt, model) {
  const anthropic = aiAgent.services.anthropic;
  if (!anthropic) throw new Error('Claude not configured');

  const message = await anthropic.messages.create({
    model: model.includes('opus') ? 'claude-3-opus-20240229' : 
           model.includes('sonnet') ? 'claude-3-sonnet-20240229' : 
           'claude-3-haiku-20240307',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text;
}

async function handleGemini(aiAgent, prompt, model) {
  const gemini = aiAgent.services.gemini;
  if (!gemini) throw new Error('Gemini not configured');

  const modelInstance = gemini.getGenerativeModel({ 
    model: model.includes('1.5') ? 'gemini-1.5-pro' : 'gemini-pro' 
  });

  const result = await modelInstance.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

async function handleAnyAvailable(aiAgent, prompt) {
  // Prova in ordine: Gemini -> Claude -> GPT
  if (aiAgent.services.gemini) {
    return handleGemini(aiAgent, prompt, 'gemini-pro');
  } else if (aiAgent.services.anthropic) {
    return handleClaude(aiAgent, prompt, 'claude-3-haiku');
  } else if (aiAgent.services.openai) {
    return handleOpenAI(aiAgent, prompt, 'gpt-3.5-turbo');
  }
  
  throw new Error('No AI provider available');
}

module.exports = router;
