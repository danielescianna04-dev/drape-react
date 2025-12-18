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
    #!/bin/sh
    # Install standard tools
    curl -fsSL https://code-server.dev/install.sh | sh
    code-server --auth none --port 13337 >/tmp/code-server.log 2>&1 &
  EOF
}

resource "coder_app" "vscode" {
  agent_id     = coder_agent.main.id
  slug         = "vscode"
  display_name = "VS Code"
  url          = "http://localhost:13337/?folder=/home/coder"
  icon         = "/icon/code.svg"
  subdomain    = true
  share        = "owner"

  healthcheck {
    url       = "http://localhost:13337/healthz"
    interval  = 5
    threshold = 6
  }
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
