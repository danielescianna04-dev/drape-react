const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * AI Agent per Warp Mobile IDE
 * Gestisce l'esecuzione autonoma di comandi tramite AI
 */
class AIAgent {
  constructor() {
    this.services = {};
    this.activeProvider = 'gemini'; // Fallback to available provider
    this.maxIterations = parseInt(process.env.AGENT_MAX_ITERATIONS) || 10;
    this.timeoutSeconds = parseInt(process.env.AGENT_TIMEOUT_SECONDS) || 300;
    this.autoApprove = process.env.AGENT_AUTO_APPROVE === 'true';
    this.isInitialized = false;
  }

  /**
   * Inizializza tutti i servizi AI disponibili
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // OpenAI
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key-here') {
        this.services.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        console.log('✅ OpenAI service initialized with GPT-4-turbo model');
      }

      // Anthropic (Claude)
      if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your-claude-api-key-here') {
        this.services.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });
        console.log('✅ Anthropic service initialized');
      }

      // Google AI (Gemini)
      if (process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY !== 'your-gemini-api-key-here') {
        this.services.gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        console.log('✅ Gemini service initialized');
      }

      this.isInitialized = true;
      console.log(`🤖 AI Agent initialized with ${Object.keys(this.services).length} providers`);
    } catch (error) {
      console.error('❌ Failed to initialize AI Agent:', error);
    }
  }

  /**
   * Verifica se l'AI Agent è disponibile
   */
  isAvailable() {
    return this.isInitialized && Object.keys(this.services).length > 0;
  }

  /**
   * Ottieni i provider disponibili
   */
  getAvailableProviders() {
    return Object.keys(this.services);
  }

  /**
   * Cambia provider attivo
   */
  setActiveProvider(provider) {
    if (!this.services[provider]) {
      throw new Error(`Provider ${provider} not available`);
    }
    this.activeProvider = provider;
    console.log(`🔄 Switched to AI provider: ${provider}`);
  }

  /**
   * Genera una risposta dall'AI
   */
  async generateResponse(prompt, context = {}) {
    // Mock response when no credits
    if (!this.isAvailable()) {
      return {
        content: `🤖 Mock AI Response:\n\nI received your prompt: "${prompt}"\n\nThis is a simulated response since AI services are currently unavailable.\n\n✨ Key points:\n- Your request was processed
- This is demonstration mode
- Real AI will work when credits are available\n\nTo enable real AI:\n1. Add credits to OpenAI or Google AI\n2. Restart the backend\n3. Try again!`,
        provider: 'mock',
        model: 'demo-model',
        tokensUsed: 50,
        responseTime: 500,
        timestamp: new Date().toISOString()
      };
    }

    const service = this.services[this.activeProvider];
    if (!service) {
      throw new Error(`Provider ${this.activeProvider} not available`);
    }

    try {
      let response;
      const startTime = Date.now();

      switch (this.activeProvider) {
        case 'openai':
          response = await this.generateOpenAIResponse(service, prompt, context);
          break;
        case 'anthropic':
          response = await this.generateAnthropicResponse(service, prompt, context);
          break;
        case 'gemini':
          response = await this.generateGeminiResponse(service, prompt, context);
          break;
        default:
          throw new Error(`Unsupported provider: ${this.activeProvider}`);
      }

      const responseTime = Date.now() - startTime;
      console.log(`🤖 AI Response generated in ${responseTime}ms using ${this.activeProvider}`);
      
      return {
        content: response.content,
        provider: this.activeProvider,
        model: response.model,
        tokensUsed: response.tokensUsed || 0,
        responseTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ AI Generation error with ${this.activeProvider}:`, error);
      throw new Error(`AI Generation failed: ${error.message}`);
    }
  }

  /**
   * OpenAI GPT response
   */
  async generateOpenAIResponse(openai, prompt, context) {
    const response = await openai.chat.completions.create({
      model: context.model || 'gpt-5-chat-latest',
      messages: [
        {
          role: 'system',
          content: this.getSystemPrompt(context)
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: context.temperature || 0.7,
      max_tokens: context.maxTokens || 2000,
    });

    return {
      content: response.choices[0].message.content,
      model: response.model,
      tokensUsed: response.usage?.total_tokens || 0
    };
  }

  /**
   * Anthropic Claude response
   */
  async generateAnthropicResponse(anthropic, prompt, context) {
    const response = await anthropic.messages.create({
      model: context.model || 'claude-3-sonnet-20240229',
      max_tokens: context.maxTokens || 2000,
      temperature: context.temperature || 0.7,
      system: this.getSystemPrompt(context),
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    return {
      content: response.content[0].text,
      model: response.model,
      tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0
    };
  }

  /**
   * Google Gemini response
   */
  async generateGeminiResponse(geminiService, prompt, context) {
    const model = geminiService.getGenerativeModel({ 
      model: context.model || 'gemini-pro' 
    });

    const systemPrompt = this.getSystemPrompt(context);
    const fullPrompt = `${systemPrompt}\n\nUser: ${prompt}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;

    return {
      content: response.text(),
      model: context.model || 'gemini-pro',
      tokensUsed: 0 // Gemini doesn't provide token usage easily
    };
  }

  /**
   * Genera system prompt per il contesto Warp IDE
   */
  getSystemPrompt(context = {}) {
    return `You are an AI agent assistant for Warp Mobile AI IDE, a revolutionary mobile-first development environment. 

**Your Role:**
- Help developers write, debug, and optimize code directly on mobile devices
- Execute terminal commands in isolated Docker containers
- Provide intelligent code suggestions and explanations
- Assist with project setup, dependency management, and deployment

**Current Context:**
- Working Directory: ${context.workingDir || '/workspace'}
- Programming Languages: JavaScript/TypeScript, Python, Flutter/Dart, React, Vue, Angular
- Available Tools: Node.js, npm, git, docker, linux utilities
- Container Environment: Alpine Linux with development tools

**Capabilities:**
- Generate and explain code snippets
- Debug errors and suggest fixes
- Refactor and optimize existing code
- Create project structures and configurations
- Execute terminal commands when requested
- Provide real-time development assistance

**Guidelines:**
- Always provide clear, concise, and actionable responses
- Include relevant code examples when explaining concepts
- Consider mobile development constraints and best practices
- Prioritize security and performance in suggestions
- Explain complex concepts in simple terms
- Ask clarifying questions when the request is ambiguous

**Response Format:**
- For code generation: Provide complete, runnable code with comments
- For explanations: Use clear structure with examples
- For debugging: Identify the issue and provide step-by-step solutions
- For commands: Include the exact command to run and expected output

Remember: You're helping developers be productive on mobile devices, so keep responses focused and immediately actionable.`;
  }

  /**
   * Modalità Agent autonoma - esegue task complessi step-by-step
   */
  async executeAutonomousTask(task, session, websocket = null) {
    if (!this.isAvailable()) {
      throw new Error('AI Agent not available');
    }

    console.log(`🤖 Starting autonomous task: ${task}`);
    
    const execution = {
      taskId: Date.now().toString(),
      task: task,
      status: 'running',
      steps: [],
      startTime: Date.now(),
      maxIterations: this.maxIterations
    };

    // Notifica inizio task
    if (websocket) {
      websocket.send(JSON.stringify({
        type: 'agent_task_started',
        taskId: execution.taskId,
        task: task,
        timestamp: Date.now()
      }));
    }

    try {
      for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
        console.log(`🔄 Agent iteration ${iteration}/${this.maxIterations}`);
        
        // Genera il prompt per questo step
        const contextPrompt = this.buildContextPrompt(task, execution.steps, session);
        
        // Ottieni la risposta dell'AI
        const aiResponse = await this.generateResponse(contextPrompt, {
          workingDir: session.workingDir,
          maxTokens: 1500,
          temperature: 0.3 // Più deterministico per tasks autonomi
        });

        // Parsa la risposta per estrarre comandi e azioni
        const actionPlan = this.parseActionPlan(aiResponse.content);
        
        if (actionPlan.completed) {
          execution.status = 'completed';
          execution.result = actionPlan.result;
          break;
        }

        // Esegui i comandi proposti
        for (const action of actionPlan.actions) {
          const stepResult = await this.executeAgentStep(action, session, websocket);
          execution.steps.push({
            iteration,
            action: action.type,
            command: action.command,
            reasoning: action.reasoning,
            result: stepResult,
            timestamp: Date.now()
          });

          // Notifica progress
          if (websocket) {
            websocket.send(JSON.stringify({
              type: 'agent_step_completed',
              taskId: execution.taskId,
              step: execution.steps[execution.steps.length - 1],
              timestamp: Date.now()
            }));
          }

          // Se il comando fallisce, chiedi all'AI come procedere
          if (!stepResult.success && action.critical) {
            console.log(`❌ Critical step failed: ${action.command}`);
            break;
          }
        }

        // Check timeout
        if (Date.now() - execution.startTime > this.timeoutSeconds * 1000) {
          execution.status = 'timeout';
          break;
        }
      }

      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;

      // Notifica completamento
      if (websocket) {
        websocket.send(JSON.stringify({
          type: 'agent_task_completed',
          taskId: execution.taskId,
          status: execution.status,
          result: execution.result || 'Task completed',
          duration: execution.duration,
          stepsCount: execution.steps.length,
          timestamp: Date.now()
        }));
      }

      console.log(`🎉 Agent task ${execution.status}: ${task} (${execution.duration}ms, ${execution.steps.length} steps)`);
      return execution;

    } catch (error) {
      execution.status = 'error';
      execution.error = error.message;
      execution.endTime = Date.now();

      console.error(`❌ Agent task failed: ${task}`, error);
      
      if (websocket) {
        websocket.send(JSON.stringify({
          type: 'agent_task_error',
          taskId: execution.taskId,
          error: error.message,
          timestamp: Date.now()
        }));
      }

      throw error;
    }
  }

  /**
   * Costruisce il prompt di contesto per l'agent
   */
  buildContextPrompt(originalTask, previousSteps, session) {
    let prompt = `**AUTONOMOUS AGENT TASK**
Original Task: "${originalTask}"

**Current Environment:**
- Working Directory: ${session.workingDir}
- Container ID: ${session.containerId}

**Previous Steps Executed:**
${previousSteps.map((step, i) => 
  `${i + 1}. ${step.action}: ${step.command} -> ${step.result.success ? 'SUCCESS' : 'FAILED'}`
).join('\n') || 'None'}

**Your Instructions:**
Analyze the task and current progress. Plan the next action(s) to move closer to completing the original task.

**Response Format (JSON):**
{
  "completed": false,
  "reasoning": "Why this step is necessary...",
  "actions": [
    {
      "type": "command|create_file|analyze",
      "command": "exact command to execute",
      "reasoning": "why this action is needed",
      "critical": true/false
    }
  ]
}

If task is complete, return:
{
  "completed": true,
  "result": "Final result description"
}

Focus on practical, executable steps. Be specific with file paths and commands.`;

    return prompt;
  }

  /**
   * Parsa il piano d'azione dall'AI
   */
  parseActionPlan(aiResponse) {
    try {
      // Cerca JSON nella risposta
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || 
                       aiResponse.match(/```\n([\s\S]*?)\n```/) ||
                       [null, aiResponse];
      
      const jsonStr = jsonMatch[1] || aiResponse;
      const plan = JSON.parse(jsonStr.trim());
      
      return {
        completed: plan.completed || false,
        result: plan.result || null,
        reasoning: plan.reasoning || '',
        actions: plan.actions || []
      };
    } catch (error) {
      console.error('Failed to parse action plan:', error);
      // Fallback: cerca comandi nel testo
      const commands = this.extractCommandsFromText(aiResponse);
      return {
        completed: false,
        reasoning: 'Extracted from text analysis',
        actions: commands.map(cmd => ({
          type: 'command',
          command: cmd,
          reasoning: 'Extracted from AI response',
          critical: false
        }))
      };
    }
  }

  /**
   * Estrae comandi dal testo quando il parsing JSON fallisce
   */
  extractCommandsFromText(text) {
    const commands = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
      // Cerca pattern di comandi comuni
      const cmdMatches = [
        line.match(/`([^`]+)`/),
        line.match(/\$ (.+)/),
        line.match(/Run: (.+)/i),
        line.match(/Execute: (.+)/i)
      ];
      
      for (const match of cmdMatches) {
        if (match) {
          commands.push(match[1].trim());
        }
      }
    }
    
    return commands.slice(0, 3); // Max 3 comandi per safety
  }

  /**
   * Esegue un singolo step dell'agent
   */
  async executeAgentStep(action, session, websocket = null) {
    console.log(`🔧 Executing agent step: ${action.type} - ${action.command}`);
    
    try {
      switch (action.type) {
        case 'command':
          return await session.executeCommand(action.command);
          
        case 'create_file':
          // TODO: Implementare creazione file
          return { success: true, output: 'File creation not implemented yet' };
          
        case 'analyze':
          // TODO: Implementare analisi codice
          return { success: true, output: 'Code analysis not implemented yet' };
          
        default:
          return { success: false, output: `Unknown action type: ${action.type}` };
      }
    } catch (error) {
      console.error(`Agent step execution failed:`, error);
      return { 
        success: false, 
        output: `Execution failed: ${error.message}` 
      };
    }
  }

  /**
   * Ottieni statistiche dell'agent
   */
  getStats() {
    return {
      isAvailable: this.isAvailable(),
      activeProvider: this.activeProvider,
      availableProviders: this.getAvailableProviders(),
      config: {
        maxIterations: this.maxIterations,
        timeoutSeconds: this.timeoutSeconds,
        autoApprove: this.autoApprove
      }
    };
  }
}

module.exports = AIAgent;