// Multi-AI Orchestrator with shared context
const { VertexAI } = require('@google-cloud/vertexai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class AIOrchestrator {
  constructor() {
    // Initialize all AI models
    this.vertexAI = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    // Shared context across all AIs
    this.sharedContext = {
      currentProject: null,
      projectFiles: [],
      recentCommands: [],
      activeIssues: [],
      userPreferences: {}
    };
  }

  // Update context for all AIs
  updateContext(projectId, newContext) {
    this.sharedContext = {
      ...this.sharedContext,
      currentProject: projectId,
      ...newContext,
      timestamp: new Date().toISOString()
    };
  }

  // Smart AI selection based on task type
  selectBestAI(taskType, userQuery) {
    const aiCapabilities = {
      'code-analysis': 'vertex-ai',      // Best for Google Cloud integration
      'debugging': 'claude',             // Best logical reasoning
      'explanation': 'gpt-4',            // Best at teaching
      'code-generation': 'gemini',       // Fastest code completion
      'architecture': 'gpt-4',           // Best system design
      'optimization': 'vertex-ai'        // Best for cloud optimization
    };

    return aiCapabilities[taskType] || 'gpt-4'; // Default to GPT-4
  }

  // Multi-AI collaboration
  async collaborativeResponse(userQuery, projectContext) {
    // Update shared context
    this.updateContext(projectContext.projectId, projectContext);

    // Step 1: Primary AI analyzes the query
    const primaryAI = this.selectBestAI(this.classifyQuery(userQuery), userQuery);
    const primaryResponse = await this.queryAI(primaryAI, userQuery);

    // Step 2: Secondary AI reviews and enhances
    const secondaryAI = this.getComplementaryAI(primaryAI);
    const enhancedResponse = await this.queryAI(secondaryAI, 
      `Review and enhance this solution: ${primaryResponse.content}`
    );

    // Step 3: Vertex AI optimizes for Google Cloud (if applicable)
    let finalResponse = enhancedResponse;
    if (this.needsCloudOptimization(userQuery)) {
      finalResponse = await this.queryAI('vertex-ai', 
        `Optimize this for Google Cloud: ${enhancedResponse.content}`
      );
    }

    return {
      primary: { ai: primaryAI, response: primaryResponse },
      enhanced: { ai: secondaryAI, response: enhancedResponse },
      final: { ai: 'vertex-ai', response: finalResponse },
      context: this.sharedContext
    };
  }

  // Query specific AI with shared context
  async queryAI(aiType, query) {
    const contextualQuery = this.addContextToQuery(query);
    
    switch (aiType) {
      case 'vertex-ai':
        return await this.queryVertexAI(contextualQuery);
      case 'gpt-4':
        return await this.queryOpenAI(contextualQuery);
      case 'claude':
        return await this.queryAnthropic(contextualQuery);
      case 'gemini':
        return await this.queryGemini(contextualQuery);
      default:
        throw new Error(`Unknown AI type: ${aiType}`);
    }
  }

  // Add project context to every query
  addContextToQuery(query) {
    const context = `
Project Context:
- Current Project: ${this.sharedContext.currentProject}
- Files: ${this.sharedContext.projectFiles.join(', ')}
- Recent Commands: ${this.sharedContext.recentCommands.join(', ')}
- Active Issues: ${this.sharedContext.activeIssues.join(', ')}

User Query: ${query}

Please provide a response that takes into account the current project context.
    `;
    return context;
  }

  // AI-specific implementations
  async queryVertexAI(query) {
    const model = this.vertexAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(query);
    return {
      content: result.response.text(),
      model: 'vertex-ai',
      timestamp: new Date().toISOString()
    };
  }

  async queryOpenAI(query) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: query }],
      temperature: 0.7
    });
    return {
      content: response.choices[0].message.content,
      model: 'gpt-4',
      timestamp: new Date().toISOString()
    };
  }

  async queryAnthropic(query) {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4000,
      messages: [{ role: 'user', content: query }]
    });
    return {
      content: response.content[0].text,
      model: 'claude',
      timestamp: new Date().toISOString()
    };
  }

  async queryGemini(query) {
    // Use Vertex AI Gemini for fast code completion
    const model = this.vertexAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(query);
    return {
      content: result.response.text(),
      model: 'gemini',
      timestamp: new Date().toISOString()
    };
  }

  // Helper methods
  classifyQuery(query) {
    const keywords = {
      'code-analysis': ['analyze', 'review', 'check', 'audit'],
      'debugging': ['error', 'bug', 'crash', 'fix', 'debug'],
      'explanation': ['explain', 'how', 'why', 'what', 'understand'],
      'code-generation': ['create', 'generate', 'build', 'make', 'write'],
      'architecture': ['design', 'structure', 'architecture', 'pattern'],
      'optimization': ['optimize', 'improve', 'performance', 'faster']
    };

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some(word => query.toLowerCase().includes(word))) {
        return type;
      }
    }
    return 'explanation'; // Default
  }

  getComplementaryAI(primaryAI) {
    const complements = {
      'vertex-ai': 'gpt-4',    // Google AI + OpenAI
      'gpt-4': 'claude',       // OpenAI + Anthropic  
      'claude': 'vertex-ai',   // Anthropic + Google
      'gemini': 'claude'       // Fast + Thorough
    };
    return complements[primaryAI] || 'gpt-4';
  }

  needsCloudOptimization(query) {
    const cloudKeywords = ['deploy', 'scale', 'performance', 'cloud', 'server'];
    return cloudKeywords.some(word => query.toLowerCase().includes(word));
  }
}

module.exports = AIOrchestrator;
