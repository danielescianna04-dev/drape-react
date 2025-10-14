const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const { VertexAI } = require('@google-cloud/vertexai');
const { WorkstationsClient } = require('@google-cloud/workstations').v1;

const app = express();
const PORT = process.env.PORT || 3000;

// Google Cloud Configuration - Same project as warp-mobile-ai-ide
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'drape-mobile-ide';
const LOCATION = 'us-central1';
const CLUSTER = 'drape-dev-cluster';
const CONFIG = 'drape-workstation-config';

const vertex_ai = new VertexAI({ project: PROJECT_ID, location: LOCATION });
const workstationsClient = new WorkstationsClient();

const GITHUB_CLIENT_ID = 'Ov23likDO7phRcPUBcrk';
const GITHUB_CLIENT_SECRET = '74afe739ecc6c19948178aca719bf006bec1dda7';

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'drape-backend' });
});

// GitHub OAuth Device Flow - Start
app.post('/github/device-flow', async (req, res) => {
  try {
    const response = await axios.post(
      'https://github.com/login/device/code',
      new URLSearchParams({
        client_id: req.body.client_id,
        scope: req.body.scope,
      }),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Device flow error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GitHub OAuth Device Flow - Poll
app.post('/github/poll-device', async (req, res) => {
  try {
    const response = await axios.post(
      'https://github.com/login/oauth/access_token',
      new URLSearchParams({
        client_id: req.body.client_id,
        device_code: req.body.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Poll device error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GitHub OAuth - Exchange code for token
app.post('/github/exchange-code', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    
    const response = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: redirect_uri,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );
    
    res.json(response.data);
  } catch (error) {
    console.error('Exchange code error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// AI Chat endpoint - Using REST API for better auth compatibility
app.post('/ai/chat', async (req, res) => {
    const { prompt, conversationHistory = [], model = 'gemini-2.0-flash' } = req.body;
    
    if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
    }
    
    try {
        // Get access token
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        const { stdout: token } = await execAsync('gcloud auth print-access-token');
        const accessToken = token.trim();
        
        // Prepare request to Vertex AI REST API
        const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/gemini-2.0-flash-exp:generateContent`;
        
        const requestBody = {
            contents: [
                // Add conversation history
                ...conversationHistory.map((msg, i) => ({
                    role: i % 2 === 0 ? 'user' : 'model',
                    parts: [{ text: msg }]
                })),
                // Add current prompt
                {
                    role: 'user',
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
            },
            systemInstruction: {
                parts: [{ text: 'Sei un assistente AI intelligente e versatile. Rispondi sempre in italiano in modo naturale e conversazionale.' }]
            }
        };
        
        const response = await axios.post(endpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'Nessuna risposta disponibile';
        
        res.json({
            success: true,
            content,
            model: 'gemini-2.0-flash-exp',
            usage: response.data.usageMetadata
        });
        
    } catch (error) {
        console.error('AI Chat error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.response?.data?.error?.message || error.message
        });
    }
});

// Terminal execute endpoint (placeholder)
app.post('/terminal/execute', async (req, res) => {
  const { command, workstationId } = req.body;
  
  // TODO: Implementare esecuzione comando su workstation
  res.json({
    output: `Executed: ${command}`,
    exitCode: 0,
  });
});

// Workstation create endpoint - Using same Google Cloud project
app.post('/workstation/create', async (req, res) => {
  const { repositoryUrl, userId } = req.body;
  
  try {
    const parent = `projects/${PROJECT_ID}/locations/${LOCATION}/workstationClusters/${CLUSTER}/workstationConfigs/${CONFIG}`;
    const workstationId = `ws-${userId}-${Date.now()}`;
    
    const [operation] = await workstationsClient.createWorkstation({
      parent,
      workstationId,
      workstation: {
        displayName: `Drape Workstation - ${userId}`,
        annotations: {
          'repository-url': repositoryUrl,
          'created-by': 'drape-react',
        },
      },
    });

    res.json({
      workstationId,
      status: 'creating',
      repositoryUrl,
      operationName: operation.name,
    });
  } catch (error) {
    console.error('Workstation creation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Drape Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`☁️  Connected to Google Cloud Project: ${PROJECT_ID}`);
  console.log(`🌍 Location: ${LOCATION}`);
});
