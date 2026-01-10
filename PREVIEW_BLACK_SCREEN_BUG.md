# BUG: Preview Shows Black Screen on Refresh

## Problema

Quando l'utente fa refresh della preview, lo schermo rimane nero anche se il server funziona.

## Root Cause

1. **WebView opacity: 0** - Il WebView ha `opacity: webViewReady ? 1 : 0`
   - Se React non monta, `webViewReady` rimane `false`
   - Il WebView diventa invisibile (opacity: 0)
   - L'utente vede nero (lo sfondo)

2. **machineId perso** - `globalFlyMachineId` non viene persistito
   - Al refresh dello store, `flyMachineId` diventa `null`
   - WebView carica senza `Fly-Force-Instance-Id` header
   - Fly.io non sa a quale VM routare → 404 o errore
   - React non monta → schermo nero

## Fix Necessari

### Fix 1: Non nascondere il WebView con opacity

In `PreviewPanel.tsx`, cambia:
```jsx
// PRIMA (problematico)
style={[styles.webView, { opacity: webViewReady ? 1 : 0 }]}

// DOPO (mostra sempre, anche con errori)
style={styles.webView}
```

Oppure usa un overlay di loading invece di nascondere:
```jsx
<>
  <WebView style={styles.webView} ... />
  {!webViewReady && <LoadingOverlay />}
</>
```

### Fix 2: Persistere machineId per progetto

Nel `terminalStore.ts`, salva il machineId per ogni progetto:
```javascript
// Aggiungi mapping progetto -> machineId
projectMachineIds: {} as Record<string, string>,

setFlyMachineId: (id, projectId) => set((state) => ({
  flyMachineId: id,
  projectMachineIds: projectId
    ? { ...state.projectMachineIds, [projectId]: id }
    : state.projectMachineIds
})),

// Al cambio progetto, recupera il machineId salvato
setWorkstationId: (id) => set((state) => ({
  workstationId: id,
  flyMachineId: state.projectMachineIds[id] || null,
  // ... rest
})),
```

### Fix 3: Auto-recovery quando machineId è null

In `PreviewPanel.tsx`, aggiungi recovery logic:
```javascript
useEffect(() => {
  // Se server è running ma machineId è null, richiedi nuova session
  if (serverStatus === 'running' && !globalFlyMachineId && workstationId) {
    console.log('⚠️ Missing machineId, requesting new session...');
    // Call /fly/session with projectId to get machineId
    fetch(`${apiUrl}/fly/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: workstationId }),
      credentials: 'include'
    }).then(res => res.json()).then(data => {
      if (data.machineId) {
        setGlobalFlyMachineId(data.machineId);
      }
    });
  }
}, [serverStatus, globalFlyMachineId, workstationId]);
```

## File da Modificare

| File | Fix | Descrizione |
|------|-----|-------------|
| `src/features/terminal/components/PreviewPanel.tsx` | 1, 3 | Rimuovi opacity:0, aggiungi recovery |
| `src/core/terminal/terminalStore.ts` | 2 | Persisti machineId per progetto |

## Fix 4: Heartbeat per VM Lifecycle

### Problema Attuale
Il timeout di 30 min è basato su "ultima API call alla VM". Ma se l'utente è nel progetto
a modificare codice (senza usare la preview), la VM si stoppa comunque dopo 30 min.

### Soluzione: Heartbeat dal Frontend

**Frontend** invia heartbeat ogni 60 secondi mentre il progetto è aperto:

```javascript
// In WorkstationContext o simile
useEffect(() => {
  if (!workstationId || !apiUrl) return;

  const interval = setInterval(() => {
    fetch(`${apiUrl}/fly/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: workstationId }),
    }).catch(() => {}); // Silent fail
  }, 60000); // ogni 60 secondi

  return () => clearInterval(interval);
}, [workstationId, apiUrl]);
```

**Backend** endpoint per ricevere heartbeat:

```javascript
// In fly.js
router.post('/heartbeat', asyncHandler(async (req, res) => {
    const { projectId } = req.body;
    if (!projectId) {
        return res.status(400).json({ error: 'projectId required' });
    }

    // Aggiorna lastUsed nella sessione VM
    const vm = activeVMs.get(projectId);
    if (vm) {
        vm.lastUsed = Date.now();
        console.log(`💓 [Heartbeat] ${projectId} - VM kept alive`);
    }

    res.json({ success: true });
}));
```

### Comportamento Risultante

| Scenario | Comportamento |
|----------|---------------|
| Utente nel progetto (qualsiasi tab) | Heartbeat ogni 60s → VM attiva |
| Utente esce dal progetto | Heartbeat si ferma → timer 30 min → VM stop |
| Utente chiude app | Heartbeat si ferma → timer 30 min → VM stop |
| 10 progetti aperti in sequenza | Solo ultimo ha heartbeat attivo |

## Success Criteria

- [ ] Refresh della preview mostra il contenuto, non nero
- [ ] Switch tra progetti mantiene la preview funzionante
- [ ] Se machineId è perso, viene recuperato automaticamente
- [ ] Errori JS vengono mostrati all'utente, non nascosti
- [ ] VM resta attiva mentre utente è nel progetto (heartbeat)
- [ ] VM si stoppa 30 min dopo che utente esce dal progetto
