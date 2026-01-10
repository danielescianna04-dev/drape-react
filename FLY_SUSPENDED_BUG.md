# BUG: Fly.io App Suspended - No Machines Created

## Problema

L'app `drape-workspaces` su Fly.io è **SUSPENDED**. Questo significa:
- Nessuna macchina può essere creata
- Nessuna macchina può essere avviata
- La preview non funzionerà mai

## Evidence

Dashboard Fly.io mostra:
- Status: **Suspended** (badge giallo)
- "No machines" nella lista

## Causa

Fly.io sospende le app per:
1. **Billing issue** - Problema con il pagamento
2. **Inactivity** - App non usata per molto tempo
3. **Resource limits** - Superati i limiti del piano gratuito
4. **Manual suspension** - Sospensione manuale

## Fix Immediato

### 1. Verifica stato app via CLI
```bash
flyctl status -a drape-workspaces
```

### 2. Riattiva l'app
```bash
flyctl apps resume drape-workspaces
```

### 3. Se non funziona, controlla billing
```bash
flyctl billing -a drape-workspaces
```

### 4. Se l'app è stata eliminata, ricreala
```bash
cd backend/fly-workspace
flyctl launch --name drape-workspaces --region fra --no-deploy
flyctl deploy
```

## Fix nel Codice

Aggiungi un check nello startup del backend che verifica se l'app Fly è attiva:

```javascript
// In fly-service.js, add health check on startup
async checkAppStatus() {
    try {
        const response = await this.client.get(`/apps/${this.appName}`);
        if (response.data.status === 'suspended') {
            console.error('❌ [Fly] App is SUSPENDED! Run: flyctl apps resume drape-workspaces');
            return false;
        }
        return true;
    } catch (e) {
        console.error('❌ [Fly] App not found or inaccessible');
        return false;
    }
}
```

## Success Criteria

- [ ] `flyctl status -a drape-workspaces` mostra "running" o "deployed"
- [ ] Dashboard Fly.io NON mostra "Suspended"
- [ ] Creare un progetto crea una macchina su Fly.io
- [ ] Preview funziona

## Nota

Questo NON è un bug del codice - è un problema di configurazione/billing su Fly.io.
Prima di fixare il codice, devi riattivare l'app manualmente.
