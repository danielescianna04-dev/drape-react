# Drape Preview System - Architettura Completa

## Indice
1. [Overview](#overview)
2. [Piani e Limiti](#piani-e-limiti)
3. [Architettura Tecnica](#architettura-tecnica)
4. [Immagine Docker Base](#immagine-docker-base)
5. [Warm Pool Strategy](#warm-pool-strategy)
6. [Persistenza con Volumi](#persistenza-con-volumi)
7. [Flusso Completo](#flusso-completo)
8. [Gestione Dipendenze](#gestione-dipendenze)
9. [Allocazione Risorse Dinamica](#allocazione-risorse-dinamica)
10. [Costi e Margini](#costi-e-margini)
11. [Implementazione](#implementazione)
12. [Testing](#testing)
13. [Prompt per AI](#prompt-per-ai)

---

## Overview

Drape Preview System permette agli utenti di vedere in tempo reale l'anteprima della loro applicazione web mentre scrivono codice. L'obiettivo principale è:

**Preview visibile in massimo 30 secondi**

### Principi Fondamentali

1. **La preview è il valore** - L'utente usa Drape per VEDERE la sua app, non solo per scrivere codice
2. **Qualità uguale per tutti** - Le risorse (RAM, CPU) sono allocate in base al PROGETTO, non al piano
3. **Il piano limita la quantità** - FREE/STARTER/PRO differiscono per numero di avvii, non per qualità
4. **Persistenza totale** - Le dipendenze scaricate rimangono salvate tra le sessioni

---

## Piani e Limiti

### Struttura Piani

| Feature | FREE | STARTER €20 | PRO €50 |
|---------|------|-------------|---------|
| **Avvii Preview/mese** | 10 | 100 | Illimitati |
| **Auto-stop inattività** | 30 min | 30 min | 30 min |
| **Progetti salvati** | 3 | 10 | Illimitati |
| **Qualità preview** | Massima | Massima | Massima |
| **RAM/CPU** | Dinamica | Dinamica | Dinamica |

### Definizione "Avvio Preview"

```
CONTA come 1 avvio:
├── Apri app → avvii preview = 1 avvio
├── Chiudi app → VM si stoppa → riapri = 2° avvio
└── VM era spenta → la riavvii = nuovo avvio

NON CONTA come nuovo avvio:
├── Switch chat ↔ preview (VM resta attiva)
├── Modifichi codice (hot reload)
└── Navighi nell'app (stessa sessione)
```

---

## Architettura Tecnica

### Componenti Principali

```
┌─────────────────────────────────────────────────────────────────┐
│                         DRAPE BACKEND                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Session   │  │   Warm      │  │   Workspace             │ │
│  │   Tracker   │  │   Pool      │  │   Orchestrator          │ │
│  │             │  │   Service   │  │                         │ │
│  │ - Conta     │  │ - Pool VM   │  │ - Gestisce VM           │ │
│  │   avvii     │  │ - Auto      │  │ - Sync files            │ │
│  │ - Limiti    │  │   replenish │  │ - Monta volumi          │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│         │                │                    │                 │
│         └────────────────┼────────────────────┘                 │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      FLY.IO                                 ││
│  │                                                             ││
│  │   WARM POOL              VOLUMI                             ││
│  │   ┌─────┐┌─────┐┌─────┐  ┌─────────────────────────────┐   ││
│  │   │ VM1 ││ VM2 ││ VM3 │  │ vol-proj-1  vol-proj-2 ... │   ││
│  │   │STOP ││STOP ││STOP │  │ (persistenti per progetto) │   ││
│  │   └─────┘└─────┘└─────┘  └─────────────────────────────┘   ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Stack Tecnologico

- **Backend**: Node.js + Express
- **VM Provider**: Fly.io (Firecracker MicroVMs)
- **Storage**: Firebase Storage (codice) + Fly Volumes (workspace)
- **Cache**: Redis (sessioni VM)
- **Container**: Docker (immagine custom multi-linguaggio)

---

## Immagine Docker Base

### Filosofia

L'immagine deve coprire il **90% dei casi d'uso** con dipendenze pre-installate. Il restante 10% (dipendenze esotiche) viene gestito con download + persistenza su volume.

### Dockerfile.fat (Nuova Immagine Completa)

```dockerfile
# ============================================================
# DRAPE WORKSPACE IMAGE - FAT EDITION
# Copre 90% dei casi con zero download
# ============================================================

FROM ubuntu:22.04

LABEL maintainer="Drape Team"
LABEL description="Universal workspace with pre-installed frameworks"

ENV DEBIAN_FRONTEND=noninteractive

# ============================================================
# SYSTEM ESSENTIALS
# ============================================================
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    bash \
    openssh-client \
    psmisc \
    ca-certificates \
    gnupg \
    lsb-release \
    build-essential \
    pkg-config \
    libssl-dev \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# NODE.JS 20 LTS
# ============================================================
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Package managers
RUN npm install -g npm@latest yarn pnpm@latest

# Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# ============================================================
# PYTHON 3.12
# ============================================================
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && pip3 install --upgrade pip setuptools wheel

# Python web frameworks
RUN pip3 install --no-cache-dir \
    flask django fastapi uvicorn[standard] \
    streamlit gunicorn requests \
    numpy pandas sqlalchemy pytest

# ============================================================
# GO 1.22
# ============================================================
ENV GO_VERSION=1.22.0
RUN wget -q https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz \
    && rm go${GO_VERSION}.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/home/coder/go"

# ============================================================
# RUST (latest stable)
# ============================================================
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# ============================================================
# RUBY 3.x
# ============================================================
RUN apt-get update && apt-get install -y \
    ruby ruby-dev rubygems \
    && gem install bundler rails sinatra \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# PHP 8.x
# ============================================================
RUN apt-get update && apt-get install -y \
    php php-cli php-mbstring php-xml php-curl php-zip \
    php-mysql php-pgsql \
    && rm -rf /var/lib/apt/lists/*

# Composer
RUN curl -sS https://getcomposer.org/installer | php -- \
    --install-dir=/usr/local/bin --filename=composer

# ============================================================
# JAVA 21 + Maven + Gradle
# ============================================================
RUN apt-get update && apt-get install -y \
    openjdk-21-jdk maven \
    && rm -rf /var/lib/apt/lists/*

ENV GRADLE_VERSION=8.5
RUN wget -q https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip \
    && unzip -q gradle-${GRADLE_VERSION}-bin.zip -d /opt \
    && rm gradle-${GRADLE_VERSION}-bin.zip \
    && ln -s /opt/gradle-${GRADLE_VERSION}/bin/gradle /usr/local/bin/gradle

# ============================================================
# .NET 8.0
# ============================================================
RUN wget https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb && rm packages-microsoft-prod.deb \
    && apt-get update && apt-get install -y dotnet-sdk-8.0 \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# DENO
# ============================================================
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

# ============================================================
# PRE-INSTALLED JAVASCRIPT FRAMEWORKS (node_modules inclusi!)
# ============================================================
WORKDIR /preinstalled

# Next.js 14
RUN mkdir -p nextjs && cd nextjs && \
    npm init -y && \
    npm install next@14 react@18 react-dom@18 && \
    npm install -D typescript @types/react @types/node tailwindcss postcss autoprefixer

# React (Vite)
RUN mkdir -p react-vite && cd react-vite && \
    npm init -y && \
    npm install react@18 react-dom@18 && \
    npm install -D vite @vitejs/plugin-react typescript @types/react

# Vue 3
RUN mkdir -p vue && cd vue && \
    npm init -y && \
    npm install vue@3 && \
    npm install -D vite @vitejs/plugin-vue typescript vue-tsc

# Svelte
RUN mkdir -p svelte && cd svelte && \
    npm init -y && \
    npm install svelte && \
    npm install -D vite @sveltejs/vite-plugin-svelte typescript

# Angular (minimal)
RUN npm install -g @angular/cli && \
    mkdir -p angular && cd angular && \
    npm init -y && \
    npm install @angular/core @angular/common @angular/compiler @angular/platform-browser

# Astro
RUN mkdir -p astro && cd astro && \
    npm init -y && \
    npm install astro @astrojs/node

# Express.js Backend
RUN mkdir -p express && cd express && \
    npm init -y && \
    npm install express cors dotenv && \
    npm install -D typescript @types/express @types/node nodemon

# Tailwind CSS (standalone)
RUN mkdir -p tailwind && cd tailwind && \
    npm init -y && \
    npm install tailwindcss postcss autoprefixer

# Common utilities pre-installed
RUN npm install -g \
    http-server \
    serve \
    nodemon \
    ts-node \
    typescript \
    eslint \
    prettier

# ============================================================
# USER SETUP
# ============================================================
RUN useradd -m -d /home/coder -s /bin/bash coder

# Setup per coder user
USER coder
WORKDIR /home/coder

# Reinstalla tools per coder user
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
RUN curl -fsSL https://bun.sh/install | bash
RUN curl -fsSL https://deno.land/install.sh | sh

ENV PATH="/home/coder/.cargo/bin:/home/coder/.bun/bin:/home/coder/.deno/bin:${PATH}"
ENV GOPATH="/home/coder/go"
ENV PATH="${GOPATH}/bin:/usr/local/go/bin:${PATH}"

# Workspace directory (sarà montato come volume)
RUN mkdir -p /home/coder/workspace

# ============================================================
# DRAPE AGENT
# ============================================================
USER root
COPY --chown=coder:coder drape-agent.js /home/coder/drape-agent.js
USER coder

EXPOSE 13338 3000 8080

CMD ["node", "/home/coder/drape-agent.js"]
```

### Linguaggi e Framework Supportati

| Categoria | Linguaggio/Framework | Versione | Pre-installato |
|-----------|---------------------|----------|----------------|
| **JavaScript** | Node.js | 20 LTS | ✅ |
| | npm, yarn, pnpm, bun | latest | ✅ |
| | Next.js | 14 | ✅ + node_modules |
| | React (Vite) | 18 | ✅ + node_modules |
| | Vue | 3 | ✅ + node_modules |
| | Svelte | latest | ✅ + node_modules |
| | Angular | 17 | ✅ + node_modules |
| | Astro | latest | ✅ + node_modules |
| | Express | latest | ✅ + node_modules |
| **Python** | Python | 3.x | ✅ |
| | Django | latest | ✅ |
| | Flask | latest | ✅ |
| | FastAPI | latest | ✅ |
| | Streamlit | latest | ✅ |
| **Go** | Go | 1.22 | ✅ |
| **Rust** | Rust + Cargo | stable | ✅ |
| **Ruby** | Ruby | 3.x | ✅ |
| | Rails | latest | ✅ |
| | Sinatra | latest | ✅ |
| **PHP** | PHP | 8.x | ✅ |
| | Composer | latest | ✅ |
| **Java** | OpenJDK | 21 | ✅ |
| | Maven | latest | ✅ |
| | Gradle | 8.5 | ✅ |
| **.NET** | .NET SDK | 8.0 | ✅ |
| **Other** | Deno | latest | ✅ |
| | TypeScript | latest | ✅ |

### Dimensione Immagine Stimata

| Componente | Size |
|------------|------|
| Ubuntu base | ~80MB |
| Node.js + npm/yarn/pnpm | ~200MB |
| Python + libs | ~300MB |
| Go | ~500MB |
| Rust | ~800MB |
| Java + Maven/Gradle | ~600MB |
| .NET | ~700MB |
| Ruby + PHP | ~200MB |
| Pre-installed node_modules | ~800MB |
| **TOTALE** | **~4.2GB** |

---

## Warm Pool Strategy

### Concetto

Il "Warm Pool" è una **scorta di VM già create e pronte** che attendono di essere usate. Quando un utente richiede una preview, invece di creare una VM da zero (30-60s), prendiamo una dal pool (5-10s).

### Funzionamento

```
┌─────────────────────────────────────────────────────────────────┐
│                         WARM POOL                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ALL'AVVIO DEL SERVER:                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                          │
│  │ STOPPED │ │ STOPPED │ │ STOPPED │  ← 3 VM create e stoppate │
│  │  VM-1   │ │  VM-2   │ │  VM-3   │    Costo: ~$0.45/mese    │
│  └─────────┘ └─────────┘ └─────────┘                          │
│                                                                 │
│  ─────────────────────────────────────────────────────────     │
│                                                                 │
│  QUANDO UTENTE CHIEDE PREVIEW:                                 │
│                                                                 │
│  1. Prendi VM-1 dal pool                                       │
│  2. START VM-1 (5-10 secondi)                                  │
│  3. Monta volume del progetto                                  │
│  4. Sync files + start server                                  │
│                                                                 │
│  ┌─────────┐ ┌─────────┐                                      │
│  │ RUNNING │ │ STOPPED │  ← Pool sceso a 2                    │
│  │  VM-1   │ │ VM-2,3  │                                      │
│  └─────────┘ └─────────┘                                      │
│                                                                 │
│  3. IN BACKGROUND: Crea VM-4 per ripristinare pool a 3        │
│                                                                 │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐             │
│  │ RUNNING │ │ STOPPED │ │ STOPPED │ │CREATING │             │
│  │  VM-1   │ │  VM-2   │ │  VM-3   │ │  VM-4   │             │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Configurazione Pool

```javascript
const POOL_CONFIG = {
  minSize: 3,           // Minimo VM nel pool
  maxSize: 20,          // Massimo VM nel pool
  scaleThreshold: 2,    // Se pool < 2, crea nuove VM
  vmImage: 'registry.fly.io/drape-workspaces:fat',
  vmRegion: 'fra',
  vmConfig: {
    cpus: 2,
    memory_mb: 2048,
    cpu_kind: 'shared'
  }
};
```

### Auto-scaling del Pool

```
Pool Size = Utenti attivi medi ultimi 30 min + Buffer (3)

Esempio:
- 5 utenti attivi  → Pool = 8 VM
- 20 utenti attivi → Pool = 23 VM
- 50 utenti attivi → Pool = 53 VM
```

---

## Persistenza con Volumi

### Un Volume per Progetto

Ogni progetto dell'utente ha un **volume dedicato** che persiste tra le sessioni:

```
UTENTE: mario@example.com

PROGETTI:
├── ecommerce-123  →  vol-ecommerce-123 (1GB)
├── portfolio-456  →  vol-portfolio-456 (1GB)
└── blog-789       →  vol-blog-789 (1GB)

DENTRO OGNI VOLUME:
vol-ecommerce-123/
├── package.json
├── node_modules/      ← PERSISTE!
│   ├── react/
│   ├── next/
│   └── stripe/        ← Dep scaricata, salvata per sempre
├── src/
├── public/
└── .next/             ← Build cache
```

### Lifecycle del Volume

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  PRIMA APERTURA PROGETTO:                                      │
│  ├── Crea volume vol-{projectId}                               │
│  ├── Monta su /home/coder/workspace                            │
│  ├── Sync files da Firebase Storage                            │
│  └── npm install (se serve)                                    │
│                                                                 │
│  APERTURE SUCCESSIVE:                                          │
│  ├── Volume già esiste                                         │
│  ├── Monta su /home/coder/workspace                            │
│  ├── Tutto già lì (codice + node_modules)                     │
│  └── Nessun download! Preview subito.                         │
│                                                                 │
│  SESSIONE FINISCE:                                             │
│  ├── VM si stoppa                                              │
│  ├── Volume rimane (NON viene eliminato)                       │
│  └── Pronto per prossima sessione                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Costi Volumi

| Volume Size | Costo/mese |
|-------------|------------|
| 1 GB | $0.15 |
| 3 GB | $0.45 |
| 10 GB | $1.50 |

| Piano | Progetti Max | Costo Volumi Max |
|-------|--------------|------------------|
| FREE | 3 | $0.45/mese |
| STARTER | 10 | $1.50/mese |
| PRO | 100 | $15/mese |

---

## Flusso Completo

### Diagramma di Sequenza

```
UTENTE                    BACKEND                     FLY.IO
   │                         │                          │
   │  "Avvia Preview"        │                          │
   │────────────────────────>│                          │
   │                         │                          │
   │                         │  1. Check limiti piano   │
   │                         │  (avvii disponibili?)    │
   │                         │                          │
   │                         │  2. Cerca volume         │
   │                         │     progetto             │
   │                         │────────────────────────>│
   │                         │<────────────────────────│
   │                         │  (vol-xyz o null)       │
   │                         │                          │
   │                         │  3. Se no volume:       │
   │                         │     Crea volume         │
   │                         │────────────────────────>│
   │                         │<────────────────────────│
   │                         │                          │
   │                         │  4. Prendi VM dal pool  │
   │                         │────────────────────────>│
   │                         │<────────────────────────│
   │                         │  (VM stopped)           │
   │                         │                          │
   │                         │  5. Start VM +          │
   │                         │     Mount volume        │
   │                         │────────────────────────>│
   │                         │                          │
   │                         │  6. Wait for healthy    │
   │                         │<────────────────────────│
   │                         │                          │
   │                         │  7. Sync files          │
   │                         │     (se volume nuovo)   │
   │                         │────────────────────────>│
   │                         │                          │
   │                         │  8. Detect project +    │
   │                         │     Install deps        │
   │                         │     (se necessario)     │
   │                         │────────────────────────>│
   │                         │                          │
   │                         │  9. Start dev server    │
   │                         │────────────────────────>│
   │                         │                          │
   │  "Preview Ready!"       │  10. Incrementa avvii   │
   │<────────────────────────│                          │
   │                         │                          │
   │  [URL Preview]          │  11. Background:        │
   │                         │      Replenish pool     │
   │                         │────────────────────────>│
```

### Tempi per Fase

| Fase | Primo Avvio | Avvii Successivi |
|------|-------------|------------------|
| Check limiti | <100ms | <100ms |
| Get/Create volume | 1-2s | <500ms |
| Acquire VM from pool | <500ms | <500ms |
| Start VM | 5-10s | 5-10s |
| Mount volume | <1s | <1s |
| Sync files | 2-5s | 0s (già nel volume) |
| Install deps | 0-60s | 0s (già installate) |
| Start dev server | 5-10s | 5-10s |
| **TOTALE** | **15-90s** | **12-22s** |

---

## Gestione Dipendenze

### Strategia

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  CASO 1: Framework Standard (90% dei casi)                     │
│  ─────────────────────────────────────────                     │
│  Utente crea progetto Next.js                                  │
│  ├── Detect: package.json ha "next"                            │
│  ├── Copia /preinstalled/nextjs/node_modules → workspace       │
│  └── Tempo: ~2 secondi                                         │
│                                                                 │
│  CASO 2: Deps Extra (10% dei casi)                             │
│  ─────────────────────────────────────                         │
│  Utente ha package.json con "stripe", "lodash", ecc.           │
│  ├── Detect: deps non in /preinstalled                         │
│  ├── pnpm install (scarica solo le mancanti)                   │
│  ├── Salva in volume (persiste!)                               │
│  └── Tempo prima volta: 30-60s                                 │
│  └── Tempo volte successive: 0s (già nel volume)               │
│                                                                 │
│  CASO 3: Linguaggio Non-JS                                     │
│  ─────────────────────────────────────                         │
│  Utente ha progetto Python con requirements.txt                │
│  ├── Detect: requirements.txt presente                         │
│  ├── pip install -r requirements.txt                           │
│  ├── Salva in volume                                           │
│  └── Stesso pattern: lento prima volta, veloce dopo            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Algoritmo di Detection

```javascript
async function setupDependencies(projectId, workspacePath) {
  const files = await listFiles(workspacePath);

  // JavaScript/TypeScript
  if (files.includes('package.json')) {
    const pkg = await readJson(`${workspacePath}/package.json`);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Check se possiamo usare preinstalled
    const framework = detectFramework(deps);

    if (framework && !hasExtraDeps(deps, framework)) {
      // Copia da preinstalled (veloce!)
      await copyPreinstalled(framework, workspacePath);
    } else {
      // Install con pnpm (usa cache)
      await exec('pnpm install', { cwd: workspacePath });
    }
  }

  // Python
  if (files.includes('requirements.txt')) {
    await exec('pip install -r requirements.txt', { cwd: workspacePath });
  }

  // Go
  if (files.includes('go.mod')) {
    await exec('go mod download', { cwd: workspacePath });
  }

  // Rust
  if (files.includes('Cargo.toml')) {
    await exec('cargo build', { cwd: workspacePath });
  }

  // Ruby
  if (files.includes('Gemfile')) {
    await exec('bundle install', { cwd: workspacePath });
  }

  // PHP
  if (files.includes('composer.json')) {
    await exec('composer install', { cwd: workspacePath });
  }
}
```

---

## Allocazione Risorse Dinamica

### Principio

Le risorse (RAM, CPU) sono allocate in base al **progetto**, non al piano dell'utente. Tutti gli utenti ricevono la stessa qualità di esperienza.

### Algoritmo di Detection

```javascript
async function detectRequiredResources(projectId) {
  const files = await getProjectFiles(projectId);
  const pkg = await getPackageJson(projectId);

  // Conta dipendenze
  const depsCount = pkg ? Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies
  }).length : 0;

  // Rileva framework pesanti
  const hasNextJs = pkg?.dependencies?.next;
  const hasAngular = pkg?.dependencies?.['@angular/core'];
  const hasNuxt = pkg?.dependencies?.nuxt;

  // Rileva ML/AI
  const hasTensorflow = files.includes('requirements.txt') &&
    (await readFile('requirements.txt')).includes('tensorflow');
  const hasPytorch = files.includes('requirements.txt') &&
    (await readFile('requirements.txt')).includes('torch');

  // Rileva monorepo
  const isMonorepo = files.includes('pnpm-workspace.yaml') ||
    files.includes('lerna.json') ||
    files.includes('nx.json');

  // Assegna risorse
  if (hasTensorflow || hasPytorch || isMonorepo) {
    return { ram: 4096, cpu: 2, cpuKind: 'dedicated' };
  }

  if (hasNextJs || hasAngular || hasNuxt || depsCount > 100) {
    return { ram: 2048, cpu: 2, cpuKind: 'shared' };
  }

  if (depsCount > 30) {
    return { ram: 1024, cpu: 1, cpuKind: 'shared' };
  }

  return { ram: 512, cpu: 1, cpuKind: 'shared' };
}
```

### Tabella Risorse

| Tipo Progetto | RAM | CPU | Esempi |
|---------------|-----|-----|--------|
| Leggero | 512MB | 1 shared | HTML statico, blog semplice |
| Standard | 1GB | 1 shared | React, Vue, Express |
| Medio | 2GB | 2 shared | Next.js, Angular, Django |
| Pesante | 4GB | 2 dedicated | Monorepo, ML, AI |

---

## Costi e Margini

### Costi Infrastruttura

| Componente | Costo Mensile |
|------------|---------------|
| Warm Pool (3 VM stopped) | $0.45 |
| Volumi (media 10 per utente attivo) | $1.50/utente |
| Runtime VM (media 2h/giorno per utente) | $0.50/utente |
| **Costo per utente attivo** | **~$2/mese** |

### Margini per Piano

| Piano | Prezzo | Costo Stimato | Margine |
|-------|--------|---------------|---------|
| FREE | €0 | ~€0.20 | -€0.20 |
| STARTER | €20 | ~€2 | **€18 (90%)** |
| PRO | €50 | ~€5 | **€45 (90%)** |

### Break-even

```
1 utente STARTER copre 100 utenti FREE
1 utente PRO copre 250 utenti FREE

Target conversione: 5% FREE → Paid
= Profittabile con qualsiasi volume
```

---

## Implementazione

### File da Creare/Modificare

```
backend/
├── services/
│   ├── warm-pool-service.js      # NUOVO: Gestione pool VM
│   ├── volume-service.js         # NUOVO: Gestione volumi
│   ├── session-tracker.js        # NUOVO: Tracking avvii
│   ├── resource-allocator.js     # NUOVO: Allocazione dinamica
│   ├── workspace-orchestrator.js # MODIFICA: Integrazione pool+volumi
│   └── fly-service.js            # MODIFICA: API volumi
├── config/
│   └── plans.js                  # NUOVO: Configurazione piani
├── fly-workspace/
│   ├── Dockerfile.fat            # NUOVO: Immagine completa
│   └── fly.toml                  # MODIFICA: Configurazione
└── PREVIEW_SYSTEM_ARCHITECTURE.md # Questo documento
```

### Ordine di Implementazione

1. **Fase 1: Immagine Docker**
   - Creare Dockerfile.fat
   - Build e push su Fly.io registry
   - Test linguaggi e framework

2. **Fase 2: Volume Service**
   - Implementare CRUD volumi
   - Logica mount/unmount
   - Test persistenza

3. **Fase 3: Warm Pool**
   - Implementare pool service
   - Auto-replenish
   - Test startup time

4. **Fase 4: Session Tracker**
   - Tracking avvii per utente
   - Enforcement limiti piano
   - Test limiti

5. **Fase 5: Resource Allocator**
   - Detection progetto
   - Allocazione dinamica
   - Test progetti vari

6. **Fase 6: Integrazione**
   - Modificare orchestrator
   - End-to-end testing
   - Performance tuning

---

## Testing

### Test Cases

#### 1. Startup Time
```
TEST: Preview visibile entro 30 secondi
SETUP: Progetto Next.js standard
STEPS:
  1. Crea nuovo progetto
  2. Avvia preview
  3. Misura tempo fino a preview visibile
EXPECTED: < 30 secondi (primo avvio), < 20 secondi (successivi)
```

#### 2. Persistenza Dipendenze
```
TEST: Dipendenze salvate tra sessioni
SETUP: Progetto con dipendenza extra (es. "stripe")
STEPS:
  1. Avvia preview
  2. npm install stripe
  3. Chiudi sessione (VM si stoppa)
  4. Riapri preview
  5. Verifica che stripe sia già in node_modules
EXPECTED: node_modules/stripe presente senza reinstall
```

#### 3. Warm Pool
```
TEST: Pool si ripristina dopo uso
SETUP: Pool con 3 VM
STEPS:
  1. Verifica pool = 3 VM
  2. Avvia preview (consuma 1 VM)
  3. Attendi 30 secondi
  4. Verifica pool = 3 VM (ripristinato)
EXPECTED: Pool torna a 3 dopo aver usato una VM
```

#### 4. Limiti Piano
```
TEST: Enforcement limiti avvii
SETUP: Utente FREE con 10 avvii
STEPS:
  1. Avvia e chiudi preview 10 volte
  2. Prova avviare l'11° volta
EXPECTED: Errore "Limite raggiunto, passa a STARTER"
```

#### 5. Risorse Dinamiche
```
TEST: Allocazione basata su progetto
SETUP: Due progetti - uno leggero, uno pesante
STEPS:
  1. Avvia progetto HTML semplice
  2. Verifica RAM = 512MB
  3. Avvia progetto Next.js con 150 deps
  4. Verifica RAM = 2048MB
EXPECTED: Risorse allocate dinamicamente
```

### Script di Test

```bash
#!/bin/bash
# test-preview-system.sh

echo "=== Test Suite: Drape Preview System ==="

# Test 1: Startup Time
echo "Test 1: Startup Time..."
START=$(date +%s)
curl -X POST http://localhost:3000/api/preview/start \
  -H "Content-Type: application/json" \
  -d '{"projectId": "test-nextjs"}'
END=$(date +%s)
DURATION=$((END - START))
if [ $DURATION -lt 30 ]; then
  echo "✅ PASS: Startup in ${DURATION}s (< 30s)"
else
  echo "❌ FAIL: Startup in ${DURATION}s (> 30s)"
fi

# Test 2: Pool Size
echo "Test 2: Warm Pool..."
POOL_SIZE=$(curl -s http://localhost:3000/api/admin/pool/status | jq '.size')
if [ $POOL_SIZE -ge 3 ]; then
  echo "✅ PASS: Pool size = $POOL_SIZE"
else
  echo "❌ FAIL: Pool size = $POOL_SIZE (expected >= 3)"
fi

# Test 3: Volume Persistence
echo "Test 3: Volume Persistence..."
# ... altri test

echo "=== Test Suite Complete ==="
```

---

## Prompt per AI

Usa questo prompt per spiegare a un'AI cosa deve implementare:

---

### PROMPT START

```
Devi implementare il sistema di preview per Drape, una IDE cloud-based.

## OBIETTIVO
Preview della web app visibile in massimo 30 secondi.

## ARCHITETTURA

### 1. PIANI UTENTE
- FREE: 10 avvii/mese
- STARTER (€20): 100 avvii/mese
- PRO (€50): avvii illimitati

Un "avvio" = quando la VM deve partire da spenta. Non conta se l'utente
switcha tra chat e preview mentre la VM è già attiva.

### 2. WARM POOL
Mantieni sempre 3+ VM già create ma STOPPATE (stopped, non running).
Quando un utente chiede preview:
1. Prendi una VM dal pool (già creata)
2. Avviala (5-10s invece di 30-60s per crearne una nuova)
3. In background, crea una nuova VM per ripristinare il pool

### 3. VOLUMI PER PROGETTO
Ogni progetto ha un volume Fly.io dedicato che persiste:
- Prima volta: crea volume, sync files, install deps
- Volte successive: volume già lì con tutto installato
Questo permette di salvare node_modules e altre dipendenze tra sessioni.

### 4. IMMAGINE DOCKER FAT
L'immagine deve avere PRE-INSTALLATI:
- Node.js 20 + pnpm/yarn/bun
- React, Next.js, Vue, Svelte, Angular (con node_modules!)
- Python + Django/Flask/FastAPI
- Go, Rust, Ruby, PHP, Java, .NET

Il 90% degli utenti non dovrà scaricare nulla.

### 5. ALLOCAZIONE RISORSE DINAMICA
Le risorse (RAM, CPU) dipendono dal PROGETTO, non dal piano:
- Progetto leggero: 512MB
- Progetto standard: 1GB
- Progetto pesante: 2-4GB

Tutti gli utenti ricevono la stessa qualità.

## FILE DA IMPLEMENTARE

1. `services/warm-pool-service.js` - Gestione pool VM
2. `services/volume-service.js` - CRUD volumi Fly.io
3. `services/session-tracker.js` - Conta avvii per piano
4. `services/resource-allocator.js` - Detect risorse necessarie
5. `config/plans.js` - Configurazione piani
6. `fly-workspace/Dockerfile.fat` - Immagine completa

## COME TESTARE

1. Startup Time: misura tempo da richiesta a preview visibile (target: <30s)
2. Persistenza: installa dep extra, chiudi, riapri → dep deve esserci
3. Pool: dopo uso, verifica che pool torni a 3 VM
4. Limiti: utente FREE non può superare 10 avvii
5. Risorse: progetto Next.js deve avere più RAM di sito HTML statico

## TECNOLOGIE
- Fly.io per VM (Machines API)
- Fly.io Volumes per persistenza
- Node.js backend
- Docker per immagine workspace

## CODICE ESISTENTE
Il progetto ha già:
- `services/fly-service.js` - API Fly.io base
- `services/workspace-orchestrator.js` - Orchestrazione (da modificare)
- `fly-workspace/Dockerfile.full` - Immagine esistente (da espandere)

Inizia implementando il Dockerfile.fat, poi il warm-pool-service,
poi il volume-service, infine integra tutto nell'orchestrator.
```

### PROMPT END

---

## Changelog

| Data | Versione | Modifiche |
|------|----------|-----------|
| 2026-01-13 | 1.0 | Documento iniziale |

---

## Note Finali

Questo documento descrive l'architettura target per il sistema di preview di Drape.
L'implementazione deve seguire le fasi descritte nella sezione "Ordine di Implementazione".

Obiettivo finale: **Preview visibile in < 30 secondi, sempre**.
