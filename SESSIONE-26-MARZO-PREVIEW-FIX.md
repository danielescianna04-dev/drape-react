# Sessione 26 Marzo - Fix Preview System

## Cosa volevamo fare

1. **Fix "Avvio preview fallito"** - Quando l'utente cliccava "Log in" o navigava nella preview, appariva l'errore "Avvio preview fallito - Endpoint not found" anche se il server funzionava correttamente
2. **Mostrare il percorso nella barra URL** - La toolbar mostrava sempre `/` anche navigando su `/login`, `/register`, `/dashboard`
3. **Aggiungere tasti avanti/indietro** - Navigazione browser-like nella preview con frecce `<` `>`

---

## Cosa e' stato fatto

### 1. Fix errore proxy "Endpoint not found" (`PreviewPanel.tsx`)

**Problema**: `checkServerStatus` (health check polling ogni 5s) riceveva `{"error": "Endpoint not found"}` dal proxy e lo trattava come errore fatale, fermando il server e mostrando la schermata di errore.

**Fix**:
- Aggiunto riconoscimento errori proxy transitori (Endpoint not found, ECONNREFUSED, 429, Too many requests)
- Questi errori ora fanno retry invece di fermare il server
- Il health check usa sempre la URL root del progetto (`/preview/project-xxx/`) invece delle sub-route (`/login`, `/register`) che il proxy non riconosce via fetch diretto

**File**: `src/features/terminal/components/PreviewPanel.tsx` righe ~476-486

### 2. Tasti avanti/indietro nella sidebar (`VSCodeSidebar.tsx`, `uiStore.ts`)

**Problema**: Non c'era modo di tornare indietro dopo aver navigato nella preview.

**Scoperta importante**: La toolbar visibile NON e' `PreviewToolbar.tsx` ma l'header di `VSCodeSidebar.tsx`. Il VSCodeSidebar sovrappone il suo header (hamburger + URL bar + 3 puntini) sulla PreviewToolbar che rimane nascosta sotto.

**Fix**:
- Aggiunti `goBack` e `goForward` ai `previewHandlers` nello store (`uiStore.ts`)
- Registrati i handler nel `PreviewPanel.tsx` (`webViewRef.current?.goBack()` / `goForward()`)
- Aggiunti i bottoni `<` `>` nell'header del `VSCodeSidebar.tsx` tra l'hamburger e la URL bar

**File**: `src/core/terminal/uiStore.ts`, `src/features/terminal/components/PreviewPanel.tsx`, `src/features/terminal/components/VSCodeSidebar.tsx`

### 3. Path reale nella URL bar (`VSCodeSidebar.tsx`, `PreviewWebView.tsx`)

**Problema**: La URL bar nel sidebar mostrava sempre `/` hardcoded.

**Fix**:
- La URL bar ora parsa `previewCurrentUrl` dallo store ed estrae il path dopo `/preview/project-xxx/`
- Aggiunto sync URL in `onNavigationStateChange` del WebView per aggiornare lo store quando si usa back/forward (che bypassa `onShouldStartLoadWithRequest`)

**File**: `src/features/terminal/components/VSCodeSidebar.tsx` riga ~601, `src/features/terminal/components/PreviewWebView.tsx` riga ~635

### 4. PreviewToolbar aggiornata (ma nascosta dal sidebar)

`PreviewToolbar.tsx` e' stata aggiornata con back/forward e display path intelligente (ricorda ultimo path non-root). Questi cambiamenti sono nel codice ma visivamente non si vedono perche' il VSCodeSidebar la copre. Possono servire se in futuro il layout cambia.

---

## Problemi noti / da completare

1. **Il path nella barra si resetta a `/` dopo navigazione interna** - Il router Next.js genera navigazioni "fantasma" alla root (`https://drape.info/`) durante l'hydration, che resettano `currentPreviewUrl` via `onShouldStartLoadWithRequest`. La `PreviewToolbar` ha un workaround (ref che ricorda l'ultimo path non-root) ma il `VSCodeSidebar` legge direttamente dallo store senza questo filtro. Servira' aggiungere lo stesso meccanismo nel sidebar o filtrare i root rewrite nel WebView.

2. **Dipendenze mancanti nel container** - L'AI genera codice che importa librerie non presenti nel `package.json` del progetto. In questa sessione mancavano `react-hot-toast` e `date-fns`. Sono state installate manualmente via SSH (`ssh -i ~/.ssh/id_ed25519_drape -p 49222 root@77.42.1.116 "docker exec drape-ws-project-XXX sh -c 'cd /home/coder/project && npm install date-fns --legacy-peer-deps'"`). Bisognerebbe far si che l'agente AI installi automaticamente le dipendenze che usa.

3. **CSS Bootstrap loggato come JS error** - Il WebView cattura CSS di Bootstrap Reboot come `JS_ERROR` nei log. E' innocuo ma rumoroso. Il filtro in `onMessage` potrebbe ignorare messaggi che iniziano con `:host {` o contengono `Bootstrap`.

4. **Client-side exception nell'app Next.js** - Dopo il caricamento iniziale della homepage, appare "Application error: a client-side exception has occurred". Questo e' un bug dell'app generata dall'AI, non del sistema preview. Probabilmente legato all'hydration React o a componenti che accedono a `window` prima che sia disponibile.

5. **Menu 3 puntini va fuori schermo** - Il dropdown del morph button (Ricarica, Vista desktop, Pubblica, Project History) a volte esce dai bordi dello schermo. Da investigare il posizionamento in `VSCodeSidebar.tsx`.

---

## File modificati

| File | Cosa |
|------|------|
| `src/core/terminal/uiStore.ts` | Aggiunto `goBack`/`goForward` ai previewHandlers |
| `src/features/terminal/components/PreviewPanel.tsx` | Health check root URL, transient errors, goBack/goForward handlers |
| `src/features/terminal/components/PreviewToolbar.tsx` | Back/forward buttons, display path con ref (nascosto dal sidebar) |
| `src/features/terminal/components/PreviewWebView.tsx` | URL sync in onNavigationStateChange, retry "Endpoint not found" |
| `src/features/terminal/components/VSCodeSidebar.tsx` | Tasti `< >`, path reale nella URL bar |

---

## Accesso server

```bash
# SSH al server backend
ssh -i ~/.ssh/id_ed25519_drape -p 49222 root@77.42.1.116

# Container progetto
docker exec drape-ws-project-1774546075392 sh -c 'COMANDO'

# Installare dipendenze mancanti
docker exec drape-ws-project-XXX sh -c 'cd /home/coder/project && npm install PACCHETTO --legacy-peer-deps'

# Restart container (attenzione: cambia la porta interna, il proxy perde la connessione)
docker restart drape-ws-project-XXX
# Dopo il restart, premere "Riavvia Preview" dall'app per riconnettere il proxy
```
