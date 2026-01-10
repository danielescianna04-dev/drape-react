# BUG: VM Non Creata Automaticamente

## Problema

Quando l'utente apre un progetto, la VM non viene creata automaticamente.
Il frontend prova a ottenere i logs ma fallisce con 404 perché la VM non esiste.

## Evidence

```
📖 GET /fly/project/ws-1767962956074-jfdu5apdd/files  ← OK (da Storage)
📝 POST /fly/session  ← OK (setta solo cookie)
📖 GET /fly/logs/ws-1767962956074-jfdu5apdd  ← 404 (VM non esiste!)
```

## Causa

Il flusso attuale:
1. `GET /files` → legge da Firebase Storage (non serve VM)
2. `POST /session` → setta cookie di routing (assume VM esiste già)
3. `GET /logs` → prova a connettersi a VM che non esiste → 404

La VM viene creata SOLO quando:
- `POST /fly/preview/start` viene chiamato

Ma il frontend chiama `/logs` PRIMA di chiamare `startPreview`.

## Fix Necessario

### Opzione A: Auto-create VM in /logs endpoint

```javascript
// In fly.js, endpoint /logs/:projectId
router.get('/logs/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;

    // Auto-create VM if not exists
    let vmSession = await redisService.getVMSession(projectId);

    if (!vmSession) {
        console.log(`🔄 [Fly] No VM for ${projectId}, creating...`);
        try {
            vmSession = await orchestrator.getOrCreateVM(projectId);
        } catch (e) {
            return res.status(503).json({
                error: 'VM_STARTING',
                message: 'Starting workspace, please retry in a few seconds'
            });
        }
    }

    // Continue with existing logic...
}));
```

### Opzione B: Frontend deve chiamare startPreview prima

Nel frontend, prima di subscribere ai logs:
```javascript
// Ensure VM is running before subscribing to logs
await api.post('/fly/preview/start', { projectId, projectInfo });
// Then subscribe to logs
subscribeToLogs(projectId);
```

### Opzione C: Endpoint /fly/ensure-vm (lightweight)

Nuovo endpoint che crea la VM se non esiste senza avviare il dev server:
```javascript
router.post('/ensure-vm/:projectId', asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const vm = await orchestrator.getOrCreateVM(projectId);
    res.json({ success: true, machineId: vm.machineId });
}));
```

## File da Modificare

| File | Opzione | Cosa Fare |
|------|---------|-----------|
| `backend/routes/fly.js` | A | Auto-create VM in /logs |
| `frontend/.../PreviewPanel.tsx` | B | Chiamare startPreview prima di logs |
| `backend/routes/fly.js` | C | Nuovo endpoint /ensure-vm |

## Raccomandazione

**Opzione A** è la più user-friendly - l'utente non deve fare niente di diverso.
Ma potrebbe rallentare la prima richiesta di logs.

**Opzione C** è un buon compromesso - il frontend chiama un endpoint lightweight
che crea la VM, poi si subscribisce ai logs.

## Success Criteria

- [ ] Aprire un progetto crea la VM automaticamente
- [ ] `/fly/logs` non ritorna mai 404 per "VM non esiste"
- [ ] Preview funziona senza intervento manuale
