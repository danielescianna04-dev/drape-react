# 📋 DRAPE PRODUCTION-READY IMPLEMENTATION PLAN

**Status**: Ready to implement
**Version**: 2.0
**Last Updated**: 2026-01-13
**Estimated Time**: 8.5 hours
**Cost**: $20-30/month

---

## 🎯 OVERVIEW

Questo piano trasforma Drape in un sistema production-ready 100/100 con:
- ✅ Zero bug "stuck at 95%"
- ⚡ Preview 10x più veloci (2-3 min → 15-20s)
- 📊 Full monitoring e observability
- 💰 Costi prevedibili e ottimizzati

---

## 📁 STATO ATTUALE

### ✅ COMPLETATO:
- **Fase 1.1**: Docker image node:20 full
  - 100% npm compatibility
  - Package manager auto-detection (npm/pnpm/yarn)
  - Preview funzionante!

### 🔴 DA FARE:
- **Fase 1.2-1.4**: Bug fixes + UX (2.5 ore)
- **Fase 2.1-2.3**: Performance optimization (3.5 ore)
- **Fase 3.1-3.3**: Monitoring (2.5 ore)

---

# 🔴 FASE 1: CRITICAL PATH

## FASE 1.2: Next.js Version Detection

**Tempo**: 30 minuti
**Files**: `backend/routes/fly.js`, `src/features/terminal/components/PreviewPanel.tsx`

### Backend Detection
```javascript
// In backend/routes/fly.js, dopo detectProjectType()
async function detectNextJsVersion(packageJson) {
    try {
        const pkg = JSON.parse(packageJson);
        const nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next;

        if (!nextVersion) return null;

        const versionMatch = nextVersion.match(/(\d+)\.(\d+)\.(\d+)/);
        if (!versionMatch) return null;

        const [, major, minor, patch] = versionMatch;
        return {
            raw: nextVersion,
            major: parseInt(major),
            minor: parseInt(minor),
            patch: parseInt(patch)
        };
    } catch (e) {
        return null;
    }
}

// In startPreview endpoint:
if (projectInfo.type === 'nextjs') {
    const version = await detectNextJsVersion(configFiles['package.json']?.content);

    if (version && version.major === 16 && version.minor <= 1) {
        res.write(`event: warning\n`);
        res.write(`data: ${JSON.stringify({
            type: 'nextjs_version',
            version: `${version.major}.${version.minor}.${version.patch}`,
            message: 'Next.js 16.0-16.1 has known dev server hanging issues',
            recommendation: 'Consider downgrading to Next.js 15.3.0',
            link: 'https://github.com/vercel/next.js/discussions/77102'
        })}\n\n`);
    }
}
```

### Frontend Warning
```typescript
// In PreviewPanel.tsx
useEffect(() => {
    const handleSSEMessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data);

        if (event.type === 'warning' && data.type === 'nextjs_version') {
            toast.warning(
                <div>
                    <strong>⚠️ Next.js Version Issue</strong>
                    <p>{data.message}</p>
                    <p className="text-xs mt-2">Recommendation: {data.recommendation}</p>
                </div>,
                {
                    duration: 15000,
                    action: {
                        label: 'Learn More',
                        onClick: () => window.open(data.link, '_blank')
                    }
                }
            );
        }
    };

    eventSource?.addEventListener('warning', handleSSEMessage);
    return () => eventSource?.removeEventListener('warning', handleSSEMessage);
}, [eventSource]);
```

**Testing**:
```bash
# Test con Next.js 16.1.1 → deve mostrare warning
# Test con Next.js 15.x → nessun warning
```

---

## FASE 1.3: Health Check Accurato ⭐ **PRIORITÀ MASSIMA**

**Tempo**: 45 minuti
**File**: `backend/services/workspace-orchestrator.js`
**Obiettivo**: Risolve definitivamente bug "stuck at 95%"

### Step 1: Aggiungi waitForDevServer

```javascript
/**
 * Waits for dev server to be ready by checking HTTP response
 */
async waitForDevServer(agentUrl, machineId, port = 3000, timeout = 120000, progressCallback = null) {
    console.log(`⏳ [Orchestrator] Waiting for dev server on port ${port}...`);

    const axios = require('axios');
    const startTime = Date.now();
    let attempts = 0;
    let lastLogTime = 0;

    while (Date.now() - startTime < timeout) {
        attempts++;
        const elapsed = Date.now() - startTime;

        try {
            const response = await axios.get(
                `${agentUrl}/api/proxy/${machineId}:${port}/`,
                {
                    timeout: 5000,
                    validateStatus: (status) => status < 500,
                    headers: { 'Fly-Force-Instance-Id': machineId }
                }
            );

            if (response.status === 200 || response.status === 404) {
                console.log(`✅ [Orchestrator] Dev server ready in ${elapsed}ms (${attempts} attempts)`);

                if (progressCallback) {
                    progressCallback({
                        step: 'server_ready',
                        percent: 100,
                        message: 'Development server ready!',
                        elapsed
                    });
                }

                return true;
            }
        } catch (error) {
            // Server not ready, continue waiting

            if (elapsed - lastLogTime >= 5000) {
                lastLogTime = elapsed;
                const elapsedSec = Math.floor(elapsed / 1000);
                console.log(`   ⏳ Waiting... (${elapsedSec}s elapsed, attempt ${attempts})`);

                if (progressCallback) {
                    progressCallback({
                        step: 'waiting_server',
                        percent: 85 + Math.min(10, elapsed / timeout * 10),
                        message: `Starting development server... (${elapsedSec}s)`,
                        elapsed
                    });
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    throw new Error(`Dev server timeout after ${timeout/1000}s. Attempts: ${attempts}`);
}
```

### Step 2: Integra in optimizedSetup

```javascript
// In optimizedSetup(), DOPO il comando "npm run dev":

// Background execution
flyService.exec(
    agentUrl,
    startCmd,
    '/home/coder/project',
    machineId,
    600000,
    false,
    true // background
).catch(err => {
    console.error(`❌ Start command failed:`, err.message);
});

// ⭐ NEW: Wait for dev server to actually respond
console.log(`⏳ [Orchestrator] Waiting for dev server on port ${port}...`);

try {
    await this.waitForDevServer(
        agentUrl,
        machineId,
        port,
        120000,
        (progress) => {
            const wss = require('./websocket-service');
            wss.sendToProject(projectId, {
                type: 'preview_progress',
                ...progress
            });
        }
    );

    console.log(`✅ [Orchestrator] Dev server verified ready`);

} catch (error) {
    console.error(`❌ [Orchestrator] Dev server failed:`, error.message);
    throw new Error(`Preview failed: ${error.message}`);
}
```

**Testing**:
```bash
# 1. Progetto normale → aspetta HTTP 200
# 2. Progetto con errore → timeout dopo 2 min con log
# 3. Next.js lento → progress updates ogni 5s
```

---

## FASE 1.4: Progress Bar & User Feedback

**Tempo**: 60 minuti
**Files**: `workspace-orchestrator.js`, `PreviewPanel.tsx`

### Backend Progress Helper

```javascript
sendProgress(projectId, step, percent, message, details = {}) {
    const wss = require('./websocket-service');

    wss.sendToProject(projectId, {
        type: 'preview_progress',
        step,
        percent,
        message,
        timestamp: Date.now(),
        ...details
    });

    console.log(`📊 [Progress ${percent}%] ${step}: ${message}`);
}
```

### Frontend Progress UI

```typescript
const [progress, setProgress] = useState<ProgressState>({
    step: 'idle',
    percent: 0,
    message: 'Initializing...',
    timestamp: Date.now()
});

// In WebSocket handler
useEffect(() => {
    const handleProgress = (data: any) => {
        if (data.type === 'preview_progress') {
            setProgress({
                step: data.step,
                percent: data.percent,
                message: data.message,
                timestamp: data.timestamp,
                details: data.details
            });
        }
    };

    ws.on('message', handleProgress);
    return () => ws.off('message', handleProgress);
}, [ws]);

// UI
{progress.percent < 100 && (
    <div className="preview-loading-overlay">
        <CircularProgress value={progress.percent} />
        <p>{progress.message}</p>
        <ProgressBar percent={progress.percent} />
    </div>
)}
```

---

# 🟡 FASE 2: PERFORMANCE OPTIMIZATION

## FASE 2.1: VM Pool Warm ⚡ **MASSIMO IMPATTO**

**Tempo**: 2 ore
**Files**: NEW `services/vm-pool-manager.js`, `server.js`, `workspace-orchestrator.js`

### Nuovo File: vm-pool-manager.js

**Location**: `backend/services/vm-pool-manager.js`

Vedi implementazione completa nel codice sopra (troppo lungo per ripetere qui).

**Key Features**:
- Mantiene 3-5 VMs pre-booted
- Auto-replenish quando < target
- Health check ogni minuto
- Cleanup intelligente prima di ritorno al pool
- Stats e metrics

### Integrazione Server

```javascript
// In server.js
const vmPoolManager = require('./services/vm-pool-manager');

const vmPool = vmPoolManager.getInstance({
    targetPoolSize: 3,
    minPoolSize: 1,
    maxPoolSize: 5
});

vmPool.initialize().catch(err => {
    console.error('❌ VM Pool init failed:', err);
});

// Health endpoint
app.get('/health/pool', (req, res) => {
    res.json(vmPool.getStats());
});
```

### Uso in Orchestrator

```javascript
// MODIFICA getOrCreateVM()
async getOrCreateVM(projectId, projectInfo) {
    const vmPoolManager = require('./vm-pool-manager');
    const vmPool = vmPoolManager.getInstance();

    const vm = await vmPool.acquire(projectId);

    return {
        success: true,
        vm,
        fromPool: true
    };
}
```

**Performance Gain**:
```
PRIMA: 38s (VM creation + image pull + boot)
DOPO:  0.5s (acquire from pool)
RISPARMIO: 37.5s! (98% più veloce)
```

---

## FASE 2.2: Fly.io Registry Proximity

**Tempo**: 30 minuti

### Script Push

```bash
#!/bin/bash
# backend/scripts/push-to-fly-registry.sh

fly auth docker
docker build -t drape-workspace:latest -f fly-workspace/Dockerfile.optimized .
docker tag drape-workspace:latest registry.fly.io/drape-workspaces:latest
docker push registry.fly.io/drape-workspaces:latest
```

### Update fly-service.js

```javascript
get DRAPE_IMAGE_OPTIMIZED() {
    return 'registry.fly.io/drape-workspaces:latest';
}
```

**Performance Gain**: Pull time 21s → 12s (-40%)

---

## FASE 2.3: Node Modules Preservation

**Tempo**: 1 ora

### Smart Cleanup

```javascript
// In vm-pool-manager.js, _cleanupVM()
async _cleanupVM(vm) {
    // Check node_modules size
    const checkModules = await flyService.exec(
        vm.agentUrl,
        'du -sm /home/coder/project/node_modules 2>/dev/null | cut -f1 || echo 0',
        '/home/coder/project',
        vm.machineId,
        10000,
        true
    );

    const modulesSize = parseInt(checkModules.stdout.trim() || '0');

    if (modulesSize > 0 && modulesSize < 1000) {
        console.log(`✅ Preserving node_modules (${modulesSize}MB)`);

        // Remove everything EXCEPT node_modules
        await flyService.exec(
            vm.agentUrl,
            `find . -maxdepth 1 ! -name node_modules ! -name package.json ! -name . -exec rm -rf {} +`,
            '/home/coder/project',
            vm.machineId
        );

        vm.preservedModules = { size: modulesSize, preservedAt: Date.now() };
    } else {
        // Clean everything
        await flyService.exec(vm.agentUrl, 'rm -rf /home/coder/project/*', ...);
        vm.preservedModules = null;
    }
}
```

### Skip Install Logic

```javascript
// In optimizedSetup()
const canSkip = await this._canSkipNpmInstall(projectId, vm, fileNames);

if (canSkip) {
    console.log(`⚡ Skipping npm install - modules preserved!`);
    // Go directly to dev server
    return { skipped: true };
}

// Otherwise, normal install
```

**Performance Gain**: Subsequent preview stesso progetto 90s → 15s (-80%)

---

# 🟢 FASE 3: MONITORING & OBSERVABILITY

## FASE 3.1: Performance Metrics

**Tempo**: 1 ora
**File**: NEW `services/metrics-service.js`

```javascript
class MetricsService {
    async recordPreviewMetrics(data) {
        const metric = {
            timestamp: Date.now(),
            projectId: data.projectId,
            vmCreation: data.vmCreation,
            fileSync: data.fileSync,
            npmInstall: data.npmInstall,
            totalTime: data.totalTime,
            fromPool: data.fromPool,
            skippedInstall: data.skippedInstall,
            success: data.success
        };

        await this.db.collection('metrics').add(metric);
    }

    async getStats(days = 7) {
        // Calculate avg, p50, p95 timings
        // Pool hit rate, install skip rate
        // Success rate
    }
}
```

**API Endpoint**:
```javascript
router.get('/metrics/stats', async (req, res) => {
    const stats = await metricsService.getStats(parseInt(req.query.days || 7));
    res.json(stats);
});
```

---

## FASE 3.2: Error Tracking

**Tempo**: 1 ora
**File**: NEW `services/error-tracking-service.js`

```javascript
class ErrorTrackingService {
    async recordError(data) {
        await this.db.collection('errors').add({
            timestamp: Date.now(),
            type: data.type,
            message: data.message,
            projectId: data.projectId,
            context: data.context
        });

        await this.checkAlerts(data.type);
    }

    async checkErrorRate() {
        // If error rate > 10%, send alert
    }

    async alertPoolDepletion() {
        // If pool < 1 VM, send alert
    }
}
```

---

## FASE 3.3: Resource Monitoring

**Tempo**: 30 minuti
**File**: NEW `services/resource-monitor-service.js`

```javascript
class ResourceMonitorService {
    async recordSnapshot() {
        const stats = vmPool.getStats();

        await this.db.collection('resources').add({
            timestamp: Date.now(),
            vms: {
                available: stats.pool.available,
                inUse: stats.pool.inUse,
                total: stats.pool.available + stats.pool.inUse
            },
            costs: {
                hourly: (totalVMs * 0.02).toFixed(3),
                monthly: (totalVMs * 0.02 * 24 * 30).toFixed(2)
            }
        });
    }

    startMonitoring(intervalMinutes = 5) {
        setInterval(() => this.recordSnapshot(), intervalMinutes * 60 * 1000);
    }
}
```

---

# 📊 RISULTATI ATTESI

| Metrica | Prima | Dopo Fase 1 | Dopo Fase 2 | Dopo Fase 3 |
|---------|-------|-------------|-------------|-------------|
| **Cold start** | 2-3 min | 2-3 min | 1.5-2 min | 1.5-2 min |
| **Warm start** | 2-3 min | 2-3 min | 15-20s ⚡ | 15-20s |
| **Bug 95%** | Sì ❌ | No ✅ | No | No |
| **Visibility** | Bassa | Alta | Alta | Massima |
| **Costo/mese** | $0 | $0 | $20-30 | $20-30 |

---

# 📋 CHECKLIST IMPLEMENTAZIONE

## Fase 1 (Day 1-2)
- [ ] 1.2 Next.js Detection (30m)
- [ ] 1.3 Health Check (45m) ⭐
- [ ] 1.4 Progress UI (60m)

## Fase 2 (Day 3-4)
- [ ] 2.1 VM Pool (2h) ⭐
- [ ] 2.2 Fly Registry (30m)
- [ ] 2.3 Node Modules (1h)

## Fase 3 (Day 5)
- [ ] 3.1 Metrics (1h)
- [ ] 3.2 Error Tracking (1h)
- [ ] 3.3 Resources (30m)

---

# 🚀 QUICK START

```bash
# 1. Create feature branch
git checkout -b feature/production-ready

# 2. Start with Fase 1.3 (most critical)
# Edit: backend/services/workspace-orchestrator.js
# Add: waitForDevServer() method

# 3. Test
npm start
# Create preview and verify no more 95% bug

# 4. Continue with other phases...
```

---

# 💰 COST BREAKDOWN

| Component | Cost/month | Notes |
|-----------|-----------|-------|
| VM Pool (3 VMs) | $21.60 | 3 × $0.02/hr × 720hr |
| Extra VMs (avg 2 in use) | $14.40 | 2 × $0.02/hr × 720hr |
| **TOTAL** | **~$36/month** | For 10x performance |

**ROI**: < $1.20/day for instant previews!

---

# 📞 SUPPORT

**Issues?**
1. Check logs: `tail -f /tmp/drape-backend.log`
2. Check pool: `curl http://localhost:3000/health/pool`
3. Check metrics: `curl http://localhost:3000/fly/metrics/stats`

**Rollback?**
```bash
git checkout main
pm2 restart backend
```

---

**Ready to implement? Start with Fase 1.3 (Health Check) - 45 minuti!** 🚀
