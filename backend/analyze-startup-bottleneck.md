# 🐌 Analisi Bottleneck Apertura Progetto

## Timeline dall'App Log

```
🚀 Opening project → Clone/Warmup Start
  ↓
  ├─ VM allocation: INSTANT (VM prewarmed ✅)
  ├─ Agent health: INSTANT ✅
  │
  ├─ 💥 Force-sync files: 6690ms (6.7s) ← BOTTLENECK #1
  │   └─ 64 files, 2.4MB compressed
  │
  ├─ Git init: ~500ms
  ├─ File sync (2nd): 224ms ✅
  ├─ Detection: ~100ms ✅
  │
  └─ ⏱️ TOTAL WARMUP: 21895ms (22s) ← BOTTLENECK #2

🔄 Background Install (parallel)
  ├─ node_modules cache restore
  │   ├─ ⚠️ "TIER 3 disabled temporarily" ← PROBLEMA!
  │   └─ Using TIER 2.5 (GCS)
  │
  └─ .next cache restore (parallel)
      └─ Extraction: 2650ms + 4650ms

📁 Prefetch (after warmup)
  ├─ Files: instant (già in cache)
  ├─ Git data: 22710ms
  └─ Total: 22710ms

🎉 Project Ready: ~23s total
```

## 🎯 Bottleneck Identificati

### 1. **Force-sync: 6.7s** ⚠️⚠️⚠️
```
📦 Archive created: 64 files, 2416.3KB compressed
✅ Force-sync complete: 64 files in 6690ms
```

**Problema:**
- 64 files, 2.4MB prende 6.7s
- Velocità: ~360KB/s (MOLTO LENTO per rete locale!)
- Dovrebbe essere < 1s

**Possibili cause:**
1. Compressione lenta (gzip sync)
2. Upload HTTP lento
3. Agent /extract endpoint lento
4. Timeout/retry logic

### 2. **TIER 3 Disabled!** ⚠️⚠️⚠️
```
ℹ️ [Cache] TIER 3 disabled temporarily, using T[IER 2.5]
```

**Problema:**
- TIER 3 (VM-to-VM) è disabilitato nel codice!
- Usa TIER 2.5 (GCS) invece
- Questo vanifica tutto il lavoro su TIER 3!

**Dove:**
- Probabilmente in `node-modules-cache-service.js`
- Flag: `TIER_3_ENABLED = false` o simile

### 3. **Total warmup: 22s**
- Include force-sync (6.7s)
- Se ottimizziamo force-sync → warmup diventa ~15s

## 🔍 File da Controllare

1. **Force-sync bottleneck:**
   - `services/workspace-orchestrator.js` - force-sync logic
   - `services/file-watcher.js` - file syncing
   - Agent `/extract` endpoint performance

2. **TIER 3 disabled:**
   - `services/node-modules-cache-service.js`
   - Cerca: "TIER 3 disabled" o "disabled temporarily"

## 💡 Quick Wins

### Fix 1: Abilita TIER 3
```javascript
// In node-modules-cache-service.js
const TIER_3_ENABLED = true; // era false!
```
**Impatto:** node_modules restore più veloce

### Fix 2: Ottimizza force-sync
- Riduci timeout
- Usa streaming invece di buffer
- Parallelize compression

**Impatto:** 6.7s → 1-2s (4-5s risparmiati)

## 🎯 Target Performance

| Step | Current | Target | Fix |
|------|---------|--------|-----|
| Force-sync | 6.7s | < 2s | Optimize /extract |
| TIER 3 | Disabled | Enabled | Change flag |
| Total warmup | 22s | < 10s | Both fixes |
