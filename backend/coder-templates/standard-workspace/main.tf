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

echo "=== Starting Drape workspace setup ===" >> /tmp/drape-startup.log

# Install code-server
echo "Installing code-server..." >> /tmp/drape-startup.log
curl -fsSL https://code-server.dev/install.sh -o /tmp/install-code-server.sh
bash /tmp/install-code-server.sh >> /tmp/drape-startup.log 2>&1

# Start code-server in background
echo "Starting code-server..." >> /tmp/drape-startup.log
nohup code-server --auth none --port 13337 >/tmp/code-server.log 2>&1 &

# Create project directory
echo "Creating project directory..." >> /tmp/drape-startup.log
mkdir -p /home/coder/project

# ---------------------------------------------------------
# DRAPE AGENT SETUP
# ---------------------------------------------------------
echo "Installing Drape Agent..." >> /tmp/drape-startup.log
cat << 'AGENT_EOF' > /home/coder/drape-agent.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 13338;

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
        exec(command, { cwd: cwd || '/home/coder/project' }, (error, stdout, stderr) => {
          res.end(JSON.stringify({ success: !error, stdout, stderr, exitCode: error ? error.code : 0 }));
        });
      } else if (url.pathname === '/health') {
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
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
  console.log(`Drape Agent running on port $${PORT}`);
});
AGENT_EOF

nohup node /home/coder/drape-agent.js > /tmp/drape-agent.log 2>&1 &
# ---------------------------------------------------------

# Start Python HTTP server for static site preview
echo "Starting preview server on port 8000..." >> /tmp/drape-startup.log
cd /home/coder/project
nohup python3 -m http.server 8000 --bind 0.0.0.0 >/tmp/preview-8000.log 2>&1 &

echo "=== Startup complete ===" >> /tmp/drape-startup.log
EOF
}

resource "coder_app" "vscode" {
  agent_id     = coder_agent.main.id
  slug         = "vscode"
  display_name = "VS Code"
  url          = "http://localhost:13337/?folder=/home/coder"
  icon         = "/icon/code.svg"
  subdomain    = true
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
  subdomain    = true
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

resource "kubernetes_pod" "main" {
  count = data.coder_workspace.me.start_count
  metadata {
    name = "coder-${data.coder_workspace.me.owner}-${data.coder_workspace.me.name}"
    namespace = "coder"
    labels = {
        "app.kubernetes.io/name"     = "coder-workspace"
        "app.kubernetes.io/instance" = "coder-workspace-${data.coder_workspace.me.owner}-${data.coder_workspace.me.name}"
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
      ip = "34.118.226.255"
      hostnames = ["drape.info", "34.135.209.234.nip.io"]
    }

    container {
      name    = "dev"
      image   = "codercom/enterprise-node:ubuntu"
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
          "cpu"    = "250m"
          "memory" = "512Mi"
        }
        limits = {
          "cpu"    = "${data.coder_parameter.cpu.value}"
          "memory" = "${data.coder_parameter.memory.value}Gi"
        }
      }
    }
  }
}
