/**
 * Project Templates Service
 * Provides file scaffolding for different technology stacks
 */

/**
 * Template definitions for each supported technology
 */
const templates = {
    // =====================================================
    // REACT (with Vite)
    // =====================================================
    react: {
        name: 'React',
        description: 'React + Vite application',
        files: {
            'package.json': `{
  "name": "my-react-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.0"
  }
}`,
            'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
            'vite.config.js': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: true
  }
})`,
            'src/main.jsx': `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
            'src/App.jsx': `import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀 React App</h1>
      <p style={{ fontSize: '1.2rem', opacity: 0.9 }}>Created with Drape IDE</p>
      <button 
        onClick={() => setCount(count + 1)}
        style={{
          marginTop: '2rem',
          padding: '12px 24px',
          fontSize: '1rem',
          background: 'white',
          color: '#764ba2',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        Count: {count}
      </button>
    </div>
  )
}

export default App`,
            'src/index.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
}`
        },
        startCommand: 'npm install && npm run dev'
    },

    // =====================================================
    // HTML/CSS (Static)
    // =====================================================
    html: {
        name: 'HTML/CSS',
        description: 'Static HTML website',
        files: {
            'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <nav>
      <div class="logo">🌐 My Site</div>
      <ul>
        <li><a href="#home">Home</a></li>
        <li><a href="#about">About</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
  </header>

  <main>
    <section id="home" class="hero">
      <h1>Welcome to My Website</h1>
      <p>Created with Drape IDE</p>
      <button onclick="showAlert()">Get Started</button>
    </section>
  </main>

  <footer>
    <p>&copy; 2024 My Website. All rights reserved.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>`,
            'style.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #333;
}

header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem 2rem;
}

nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

.logo {
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
}

nav ul {
  display: flex;
  list-style: none;
  gap: 2rem;
}

nav a {
  color: white;
  text-decoration: none;
  transition: opacity 0.3s;
}

nav a:hover {
  opacity: 0.8;
}

.hero {
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 2rem;
}

.hero h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero p {
  font-size: 1.25rem;
  color: #666;
  margin-bottom: 2rem;
}

button {
  padding: 12px 32px;
  font-size: 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

footer {
  background: #1a1a2e;
  color: white;
  text-align: center;
  padding: 2rem;
}`,
            'script.js': `// Main JavaScript file
console.log('🚀 Website loaded!');

function showAlert() {
  alert('Welcome to your new website! 🎉');
}

// Add smooth scrolling
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    document.querySelector(this.getAttribute('href')).scrollIntoView({
      behavior: 'smooth'
    });
  });
});`
        },
        startCommand: 'python3 -m http.server 3000 --bind 0.0.0.0'
    },

    // =====================================================
    // JAVASCRIPT (Node.js)
    // =====================================================
    javascript: {
        name: 'JavaScript',
        description: 'Node.js JavaScript project',
        files: {
            'package.json': `{
  "name": "my-js-app",
  "version": "1.0.0",
  "description": "A JavaScript project",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "keywords": [],
  "author": "",
  "license": "MIT"
}`,
            'index.js': `/**
 * Main entry point
 * Created with Drape IDE
 */

console.log('🚀 Hello from JavaScript!');
console.log('📅 Current time:', new Date().toLocaleString());

// Example function
function greet(name) {
  return \`Hello, \${name}! Welcome to your new project.\`;
}

// Example class
class Calculator {
  add(a, b) { return a + b; }
  subtract(a, b) { return a - b; }
  multiply(a, b) { return a * b; }
  divide(a, b) { return b !== 0 ? a / b : 'Cannot divide by zero'; }
}

// Demo
const calc = new Calculator();
console.log('\\n📊 Calculator Demo:');
console.log('  5 + 3 =', calc.add(5, 3));
console.log('  5 - 3 =', calc.subtract(5, 3));
console.log('  5 * 3 =', calc.multiply(5, 3));
console.log('  5 / 3 =', calc.divide(5, 3));

console.log('\\n' + greet('Developer'));
console.log('\\n✅ Project is working correctly!');`
        },
        startCommand: 'npm install && npm start'
    },

    // =====================================================
    // TYPESCRIPT
    // =====================================================
    typescript: {
        name: 'TypeScript',
        description: 'TypeScript project',
        files: {
            'package.json': `{
  "name": "my-ts-app",
  "version": "1.0.0",
  "description": "A TypeScript project",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}`,
            'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}`,
            'src/index.ts': `/**
 * Main entry point
 * Created with Drape IDE
 */

console.log('🚀 Hello from TypeScript!');

// Type definitions
interface User {
  id: number;
  name: string;
  email: string;
}

// Generic function
function printInfo<T>(item: T): void {
  console.log('Info:', item);
}

// Class with types
class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
    console.log(\`✅ Added user: \${user.name}\`);
  }

  getUser(id: number): User | undefined {
    return this.users.find(u => u.id === id);
  }

  getAllUsers(): User[] {
    return this.users;
  }
}

// Demo
const service = new UserService();
service.addUser({ id: 1, name: 'Alice', email: 'alice@example.com' });
service.addUser({ id: 2, name: 'Bob', email: 'bob@example.com' });

console.log('\\n📋 All users:', service.getAllUsers());
console.log('\\n✅ TypeScript project is working!');`
        },
        startCommand: 'npm install && npm run build && npm start'
    },

    // =====================================================
    // PYTHON
    // =====================================================
    python: {
        name: 'Python',
        description: 'Python project',
        files: {
            'main.py': `"""
Main entry point
Created with Drape IDE
"""

print("🚀 Hello from Python!")
print(f"📅 Running Python {__import__('sys').version}")

# Example function
def greet(name: str) -> str:
    return f"Hello, {name}! Welcome to your new project."

# Example class
class Calculator:
    """A simple calculator class"""
    
    def add(self, a: float, b: float) -> float:
        return a + b
    
    def subtract(self, a: float, b: float) -> float:
        return a - b
    
    def multiply(self, a: float, b: float) -> float:
        return a * b
    
    def divide(self, a: float, b: float) -> float:
        if b == 0:
            raise ValueError("Cannot divide by zero")
        return a / b

# Demo
if __name__ == "__main__":
    calc = Calculator()
    print("\\n📊 Calculator Demo:")
    print(f"  5 + 3 = {calc.add(5, 3)}")
    print(f"  5 - 3 = {calc.subtract(5, 3)}")
    print(f"  5 * 3 = {calc.multiply(5, 3)}")
    print(f"  5 / 3 = {calc.divide(5, 3):.2f}")
    
    print(f"\\n{greet('Developer')}")
    print("\\n✅ Python project is working!")
`,
            'requirements.txt': `# Add your dependencies here
# Example:
# requests==2.31.0
# flask==3.0.0
`
        },
        startCommand: 'python3 main.py'
    },

    // =====================================================
    // NODE.JS (Express server)
    // =====================================================
    node: {
        name: 'Node.js',
        description: 'Node.js Express server',
        files: {
            'package.json': `{
  "name": "my-node-server",
  "version": "1.0.0",
  "description": "Node.js Express server",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}`,
            'index.js': `/**
 * Node.js Express Server
 * Created with Drape IDE
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Welcome to your Node.js server!',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      api: '/api'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api', (req, res) => {
  res.json({
    version: '1.0.0',
    message: 'API is working!'
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(\`🚀 Server running at http://0.0.0.0:\${PORT}\`);
  console.log('📍 Endpoints:');
  console.log(\`   GET / - Welcome message\`);
  console.log(\`   GET /health - Health check\`);
  console.log(\`   GET /api - API info\`);
});`
        },
        startCommand: 'npm install && npm start'
    }
};

/**
 * Get template by technology ID
 * @param {string} technologyId - Technology identifier (e.g., 'react', 'html', 'python')
 * @returns {object|null} Template object or null if not found
 */
function getTemplate(technologyId) {
    // Normalize the ID
    const normalizedId = technologyId.toLowerCase().replace(/[^a-z]/g, '');

    // Direct match
    if (templates[normalizedId]) {
        return templates[normalizedId];
    }

    // Alias mapping
    const aliases = {
        'js': 'javascript',
        'ts': 'typescript',
        'py': 'python',
        'nodejs': 'node',
        'express': 'node',
        'htmlcss': 'html',
        'statichtml': 'html',
        'reactjs': 'react',
        'cpp': 'javascript', // Fallback for unsupported
        'java': 'javascript', // Fallback for unsupported
        'swift': 'javascript', // Fallback for unsupported
        'kotlin': 'javascript', // Fallback for unsupported
        'go': 'javascript', // Fallback for unsupported
        'rust': 'javascript', // Fallback for unsupported
    };

    if (aliases[normalizedId]) {
        return templates[aliases[normalizedId]];
    }

    // Default to HTML if unknown
    console.warn(`Unknown technology: ${technologyId}, falling back to HTML template`);
    return templates.html;
}

/**
 * Get all available templates
 * @returns {object[]} Array of template metadata
 */
function getAvailableTemplates() {
    return Object.entries(templates).map(([id, template]) => ({
        id,
        name: template.name,
        description: template.description,
        fileCount: Object.keys(template.files).length
    }));
}

/**
 * Generate files for a template with customized project name
 * @param {string} technologyId - Technology identifier
 * @param {string} projectName - Project name to use in templates
 * @returns {object} Object with files (path -> content) and startCommand
 */
function generateTemplateFiles(technologyId, projectName) {
    const template = getTemplate(technologyId);
    if (!template) {
        return null;
    }

    const files = {};
    const safeName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    for (const [path, content] of Object.entries(template.files)) {
        // Replace placeholder project names
        let finalContent = content
            .replace(/my-react-app/g, safeName)
            .replace(/my-js-app/g, safeName)
            .replace(/my-ts-app/g, safeName)
            .replace(/my-node-server/g, safeName)
            .replace(/My Website/g, projectName)
            .replace(/My Site/g, projectName)
            .replace(/My React App/g, projectName);

        files[path] = finalContent;
    }

    return {
        files,
        startCommand: template.startCommand,
        description: template.description
    };
}

module.exports = {
    getTemplate,
    getAvailableTemplates,
    generateTemplateFiles,
    templates
};
