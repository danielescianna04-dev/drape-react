// AI Agent - Simplified Version for Lambda (without external dependencies)

class AIAgent {
  constructor() {
    this.providers = [];
    this.defaultProvider = 'mock';
  }

  async initialize() {
    console.log('🤖 AI Agent initialized (mock mode)');
    return { success: true, providers: ['mock'] };
  }

  async generateResponse(prompt, context = {}) {
    const startTime = Date.now();
    
    // Mock AI response for testing
    const mockResponse = this.generateMockResponse(prompt, context);
    
    return {
      content: mockResponse,
      model: 'mock-gpt',
      provider: 'mock',
      responseTime: Date.now() - startTime
    };
  }

  generateMockResponse(prompt, context) {
    // Simple mock responses based on prompt patterns
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('hello') || promptLower.includes('hi')) {
      return `Hello! I'm your AI assistant. I'm currently running in mock mode for testing. Your prompt was: "${prompt}"`;
    }
    
    if (promptLower.includes('help') || promptLower.includes('how')) {
      return `I'm here to help! Currently in mock mode, but I can assist with:\n- Code explanations\n- Programming questions\n- Project guidance\n\nYour question: "${prompt}"`;
    }
    
    if (promptLower.includes('create') || promptLower.includes('build')) {
      return `I can help you create that! Here's a basic approach:\n\n1. Plan the structure\n2. Set up the environment\n3. Implement the core features\n4. Test and refine\n\nFor: "${prompt}"`;
    }
    
    if (promptLower.includes('error') || promptLower.includes('bug') || promptLower.includes('fix')) {
      return `Let me help you debug that! Common steps:\n\n1. Check the error message\n2. Verify your syntax\n3. Look for missing dependencies\n4. Test step by step\n\nRegarding: "${prompt}"`;
    }
    
    if (promptLower.includes('code') || promptLower.includes('function') || promptLower.includes('script')) {
      return `Here's a code suggestion for your request:\n\n\`\`\`javascript\n// Example code structure\nfunction yourFunction() {\n  // Implementation based on: ${prompt}\n  console.log('This is a mock response');\n  return 'success';\n}\n\`\`\`\n\nNote: This is a mock response for testing.`;
    }
    
    // Default response
    return `I understand you're asking about: "${prompt}"\n\nI'm currently running in mock mode for testing purposes. In production, I would:\n- Analyze your request using AI\n- Provide detailed, contextual responses\n- Help with code generation and debugging\n- Offer step-by-step guidance\n\nContext received: ${JSON.stringify(context, null, 2)}`;
  }

  async executeAutonomousTask(task, executor, websocket = null) {
    const startTime = Date.now();
    const steps = [];
    
    console.log(`🤖 AI Agent executing task: ${task}`);
    
    try {
      // Mock task execution
      steps.push({
        step: 1,
        action: 'analyze_task',
        description: `Analyzing task: ${task}`,
        timestamp: Date.now(),
        success: true
      });
      
      // Simple task execution based on keywords
      if (task.toLowerCase().includes('create')) {
        steps.push({
          step: 2,
          action: 'create_structure',
          description: 'Creating project structure',
          timestamp: Date.now(),
          success: true
        });
        
        // Mock file creation
        await executor.writeFile('example.txt', `# ${task}\n\nThis is a mock file created by AI Agent.\nTask: ${task}\nTimestamp: ${new Date().toISOString()}`);
        
        steps.push({
          step: 3,
          action: 'write_file',
          description: 'Created example.txt',
          timestamp: Date.now(),
          success: true
        });
      }
      
      if (task.toLowerCase().includes('list') || task.toLowerCase().includes('show')) {
        steps.push({
          step: 2,
          action: 'list_files',
          description: 'Listing current files',
          timestamp: Date.now(),
          success: true
        });
        
        // Mock command execution
        const result = await executor.executeCommand('ls -la');
        steps.push({
          step: 3,
          action: 'execute_command',
          description: `Executed: ls -la\nResult: ${result.output?.substring(0, 100)}...`,
          timestamp: Date.now(),
          success: result.success
        });
      }
      
      steps.push({
        step: steps.length + 1,
        action: 'complete_task',
        description: 'Task completed successfully',
        timestamp: Date.now(),
        success: true
      });
      
      return {
        status: 'completed',
        steps,
        duration: Date.now() - startTime,
        result: `Mock task "${task}" completed with ${steps.length} steps.`
      };
      
    } catch (error) {
      steps.push({
        step: steps.length + 1,
        action: 'error',
        description: `Error: ${error.message}`,
        timestamp: Date.now(),
        success: false
      });
      
      return {
        status: 'failed',
        steps,
        duration: Date.now() - startTime,
        error: error.message,
        result: `Task "${task}" failed: ${error.message}`
      };
    }
  }

  // Helper method to check if AI is available
  isAvailable() {
    return true; // Always available in mock mode
  }

  // Get current configuration
  getConfig() {
    return {
      mode: 'mock',
      providers: this.providers,
      defaultProvider: this.defaultProvider
    };
  }
}

module.exports = AIAgent;