const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

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

// AI Chat endpoint (placeholder)
app.post('/ai/chat', async (req, res) => {
  const { message, model } = req.body;
  
  // TODO: Implementare chiamata a OpenAI/Claude/Gemini
  res.json({
    response: `Echo: ${message}`,
    model: model || 'auto',
  });
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

// Workstation create endpoint (placeholder)
app.post('/workstation/create', async (req, res) => {
  const { repositoryUrl, userId } = req.body;
  
  // TODO: Implementare creazione workstation su Google Cloud
  res.json({
    workstationId: `ws-${Date.now()}`,
    status: 'creating',
    repositoryUrl,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Drape Backend running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
