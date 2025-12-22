terraform {
  required_providers {
    coder = {
      source  = "coder/coder"
      version = "~> 0.17.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23.0"
    }
  }
}

provider "coder" {
}



provider "kubernetes" {
  # Running inside k8s cluster (Coder), use service account.
}

data "coder_parameter" "cpu" {
  name        = "cpu"
  display_name = "CPU"
  description = "The number of CPU cores"
  default     = "1"
  icon        = "/icon/memory.svg"
  mutable     = true
  option {
    name  = "1 Core"
    value = "1"
  }
  option {
    name  = "2 Cores"
    value = "2"
  }
}

data "coder_parameter" "memory" {
  name        = "memory"
  display_name = "Memory"
  description = "The amount of memory in GB"
  default     = "2"
  icon        = "/icon/memory.svg"
  mutable     = true
  option {
    name  = "2 GB"
    value = "2"
  }
  option {
    name  = "4 GB"
    value = "4"
  }
}

data "coder_workspace" "me" {
}

resource "coder_agent" "main" {
  arch           = "amd64"
  os             = "linux"
  
  startup_script = <<EOF
#!/bin/bash
# ULTRA-FAST STARTUP - All checks removed, services started in parallel

# Create project dir (instant)
mkdir -p /home/coder/project 2>/dev/null

# Start code-server immediately (in background)
code-server --auth none --port 13337 &>/tmp/code-server.log &

# Start preview server immediately (in background)
cd /home/coder/project && python3 -m http.server 8000 --bind 0.0.0.0 &>/tmp/preview-8000.log &

# ---------------------------------------------------------
# DRAPE AGENT SETUP (Enhanced with Hot Reload + WebSocket Terminal)
# ---------------------------------------------------------
echo "Installing Drape Agent..." >> /tmp/drape-startup.log
cat << 'AGENT_EOF' > /home/coder/drape-agent.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

const PORT = 13338;
const WS_PORT = 13339;

// Simple file watcher for hot reload
const watchedDirs = new Set();
const fileChangeCallbacks = [];

function watchDirectory(dir) {
  if (watchedDirs.has(dir)) return;
  try {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (filename && !filename.includes('node_modules') && !filename.startsWith('.')) {
        const change = { type: eventType, file: filename, timestamp: Date.now() };
        fileChangeCallbacks.forEach(cb => cb(change));
      }
    });
    watchedDirs.add(dir);
  } catch (e) { /* ignore */ }
}

// WebSocket-like terminal via HTTP long-polling (simple approach)
const terminals = new Map();

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') { res.end(); return; }

      const url = new URL(req.url, `http://localhost:$${PORT}`);
      const data = body ? JSON.parse(body) : {};

      // FILE OPERATIONS
      if (req.method === 'POST' && url.pathname === '/write') {
        const { filePath, content } = data;
        const fullPath = filePath.startsWith('/') ? filePath : path.join('/home/coder/project', filePath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content);
        res.end(JSON.stringify({ success: true, path: fullPath }));
      } else if (req.method === 'GET' && url.pathname === '/read') {
        const filePath = url.searchParams.get('path');
        const fullPath = filePath.startsWith('/') ? filePath : path.join('/home/coder/project', filePath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          res.end(JSON.stringify({ success: true, content }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'File not found' }));
        }
      } else if (req.method === 'POST' && url.pathname === '/exec') {
        const { command, cwd } = data;
        exec(command, { cwd: cwd || '/home/coder/project', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          res.end(JSON.stringify({ success: !error, stdout, stderr, exitCode: error ? error.code : 0 }));
        });
      
      // HOT RELOAD - File change notifications
      } else if (url.pathname === '/watch') {
        watchDirectory('/home/coder/project');
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const sendChange = (change) => {
          res.write(`data: $${JSON.stringify(change)}\n\n`);
        };
        fileChangeCallbacks.push(sendChange);
        
        req.on('close', () => {
          const idx = fileChangeCallbacks.indexOf(sendChange);
          if (idx > -1) fileChangeCallbacks.splice(idx, 1);
        });
      
      // TERMINAL - Spawn interactive shell
      } else if (req.method === 'POST' && url.pathname === '/terminal/create') {
        const id = Date.now().toString();
        const shell = spawn('bash', [], { 
          cwd: '/home/coder/project',
          env: { ...process.env, TERM: 'xterm-256color' }
        });
        terminals.set(id, { shell, buffer: [] });
        
        shell.stdout.on('data', (data) => {
          const t = terminals.get(id);
          if (t) t.buffer.push({ type: 'stdout', data: data.toString() });
        });
        shell.stderr.on('data', (data) => {
          const t = terminals.get(id);
          if (t) t.buffer.push({ type: 'stderr', data: data.toString() });
        });
        shell.on('close', () => terminals.delete(id));
        
        res.end(JSON.stringify({ success: true, terminalId: id }));
        
      } else if (req.method === 'POST' && url.pathname === '/terminal/input') {
        const { terminalId, input } = data;
        const t = terminals.get(terminalId);
        if (t) {
          t.shell.stdin.write(input);
          res.end(JSON.stringify({ success: true }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Terminal not found' }));
        }
        
      } else if (req.method === 'GET' && url.pathname === '/terminal/output') {
        const terminalId = url.searchParams.get('id');
        const t = terminals.get(terminalId);
        if (t) {
          const output = t.buffer.splice(0);
          res.end(JSON.stringify({ success: true, output }));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Terminal not found' }));
        }
      
      // LIST FILES for AI context
      } else if (req.method === 'GET' && url.pathname === '/files') {
        const maxDepth = parseInt(url.searchParams.get('depth') || '3');
        exec(`find /home/coder/project -maxdepth $${maxDepth} -type f ! -path '*/node_modules/*' ! -path '*/.git/*' ! -name '*.lock'`, 
          { maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
          const files = stdout ? stdout.trim().split('\n').filter(Boolean).map(f => f.replace('/home/coder/project/', '')) : [];
          res.end(JSON.stringify({ success: true, files }));
        });
        
      } else if (url.pathname === '/health') {
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), features: ['exec', 'read', 'write', 'watch', 'terminal', 'files'] }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Drape Agent running on port $${PORT} with Hot Reload + Terminal support`);
});
AGENT_EOF

nohup node /home/coder/drape-agent.js &> /tmp/drape-agent.log &
# Drape Agent started - workspace ready!
EOF
}

resource "coder_app" "vscode" {
  agent_id     = coder_agent.main.id
  slug         = "vscode"
  display_name = "VS Code"
  url          = "http://localhost:13337/?folder=/home/coder"
  icon         = "/icon/code.svg"
  subdomain    = false
  share        = "public"
}

resource "coder_app" "preview" {
  agent_id     = coder_agent.main.id
  slug         = "preview"
  display_name = "Preview (8000)"
  # The simple int port tells Coder to use the wildcard subdomain + port
  url          = "http://localhost:8000"
  icon         = "/icon/widgets.svg"
  subdomain    = false
  share        = "public"
}

resource "coder_app" "agent" {
  agent_id     = coder_agent.main.id
  slug         = "agent"
  display_name = "Drape Agent"
  url          = "http://localhost:13338"
  icon         = "/icon/bolt.svg"
  subdomain    = false
  share        = "public"
}

resource "coder_app" "expo" {
  agent_id     = coder_agent.main.id
  slug         = "expo"
  display_name = "Expo (8081)"
  url          = "http://localhost:8081"
  icon         = "/icon/widgets.svg"
  subdomain    = false
  share        = "public"
}

resource "coder_app" "devserver" {
  agent_id     = coder_agent.main.id
  slug         = "dev"
  display_name = "Dev Server (3000)"
  url          = "http://localhost:3000"
  icon         = "/icon/widgets.svg"
  subdomain    = false
  share        = "public"
}

# PERSISTENT VOLUME CLAIM - Storage that survives restarts
resource "kubernetes_persistent_volume_claim" "workspace" {
  metadata {
    name      = "ws-${data.coder_workspace.me.id}"
    namespace = "coder"
    labels = {
      "app.kubernetes.io/name" = "coder-workspace-pvc"
      "com.coder.workspace.id" = data.coder_workspace.me.id
    }
  }
  
  wait_until_bound = false
  
  spec {
    access_modes = ["ReadWriteOnce"]
    resources {
      requests = {
        storage = "10Gi"
      }
    }
  }
}

resource "kubernetes_pod" "main" {
  count = data.coder_workspace.me.start_count
  metadata {
    # Use workspace ID for a guaranteed valid and unique name
    name = "dr-${data.coder_workspace.me.id}"
    namespace = "coder"
    labels = {
        "app.kubernetes.io/name"     = "coder-workspace"
        "app.kubernetes.io/instance" = "cw-${substr(data.coder_workspace.me.owner, 0, 8)}-${substr(data.coder_workspace.me.name, 0, 8)}"
        "app.kubernetes.io/part-of"  = "coder"
        "com.coder.resource"         = "true"
        "com.coder.workspace.id"     = data.coder_workspace.me.id
        "com.coder.workspace.name"   = data.coder_workspace.me.name
        "com.coder.user.id"          = data.coder_workspace.me.owner_id
        "com.coder.user.username"    = data.coder_workspace.me.owner
    }
  }

  spec {
    security_context {
      run_as_user = 1000
      fs_group    = 1000
    }

    host_aliases {
      ip = "34.118.226.146"
      hostnames = ["drape.info"]
    }

    # PERSISTENT STORAGE - Files survive restarts
    volume {
      name = "workspace-data"
      persistent_volume_claim {
        claim_name = kubernetes_persistent_volume_claim.workspace.metadata[0].name
      }
    }

    container {
      name    = "dev"
      image   = "codercom/code-server:latest"
      command = ["sh", "-c", coder_agent.main.init_script]
      
      security_context {
        run_as_user = 1000
      }

      env {
        name  = "CODER_AGENT_TOKEN"
        value = coder_agent.main.token
      }

      resources {
        requests = {
          "cpu"    = "500m"
          "memory" = "2Gi"
        }
        limits = {
          "cpu"    = "${data.coder_parameter.cpu.value}"
          "memory" = "${data.coder_parameter.memory.value}Gi"
        }
      }

      # Mount persistent storage
      volume_mount {
        name       = "workspace-data"
        mount_path = "/home/coder"
      }
    }
  }

  timeouts {
    create = "10m"
    delete = "10m"
  }
}
