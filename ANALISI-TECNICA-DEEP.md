# Analisi Tecnica Profonda — Da "Genera Codice" a "Consegna App Funzionante"

> Basata sull'analisi completa del codebase: frontend, backend, templates, agent, preview system.
> Obiettivo: capire cosa manca per arrivare a "un click → app funzionante con login, DB, pagamenti".

---

## STATO ATTUALE: Cosa funziona e cosa no

### Cloud Mode (Supabase)

| Pezzo | Stato | Dettagli |
|-------|-------|----------|
| Toggle UI nel CreateProjectScreen | Funziona | Switch + modal FAQ |
| Creazione progetto Supabase via API | Funziona | Crea progetto, aspetta che sia ready (1-3 min) |
| Recupero API keys (anon + service role) | Funziona | Salvate in Firestore + .env.local |
| Template cloud per ogni framework | Esistono | 14 template: nextjs-cloud, react-cloud, vue-cloud, ecc. |
| Iniezione credenziali in .env.local | Funziona | NEXT_PUBLIC_SUPABASE_URL, ANON_KEY, ecc. |
| Prompt AI per generare codice Supabase | Funziona | Sistema prompt dice "usa Supabase, crea schema.sql, crea auth" |
| Esecuzione schema.sql su Supabase | Funziona | runSQL() dopo creazione progetto |
| Fallback SQLite se Supabase non disponibile | Funziona | better-sqlite3 con Express server |

**Problema principale**: Dipende da `SUPABASE_ACCESS_TOKEN` e `SUPABASE_ORG_ID` nel backend. Se non configurati, cade silenziosamente su SQLite. L'utente non sa se ha Supabase vero o SQLite.

**Problema secondario**: I template cloud per React usano Express + SQLite, NON Supabase. Solo Next.js ha il template Supabase nativo. Gli altri framework hanno cloud mode incompleto.

### Auth (Login/Registrazione)

| Stato | Dettagli |
|-------|----------|
| Cloud Mode + Supabase | Il prompt AI CHIEDE di generare login/register con `supabase.auth`. Ma dipende dalla qualità della generazione AI — non c'è un template fisso. |
| Cloud Mode + SQLite | Nessuna auth. Solo CRUD su items. |
| Modalità normale | Nessuna auth. Dati in useState, nessuna persistenza. |

**Problema**: L'auth è "sperata" dal prompt, non "garantita" dal template. Se l'AI decide di non generare le pagine login/register (o le genera male), l'utente non ha auth funzionante.

### Pagamenti (Stripe)

**NON ESISTE. Zero. Nulla.**

- Nessun template con Stripe
- Nessuna menzione di Stripe nel prompt di generazione
- Nessuna gestione di chiavi Stripe nell'env
- Nessun webhook handler
- Se un utente chiede "e-commerce con pagamenti", ottiene un catalogo con un finto bottone "Buy"

### Preview e Verifica Visiva

| Pezzo | Stato |
|-------|-------|
| WebView con preview live | Funziona |
| Dev server start/stop | Funziona |
| Rilevamento errori build (JS injection) | Funziona |
| Rilevamento errori runtime (JS errors) | Funziona |
| Element inspector (tap su elemento) | Funziona |
| Screenshot della preview | NON ESISTE |
| Agent che "vede" la preview | NON ESISTE — riceve solo testo dell'elemento selezionato |
| Auto-fix basato su screenshot | NON ESISTE |
| Verifica che l'app "funzioni" visivamente | NON ESISTE |

### Auto-Fix Esistente

C'è già un sistema di auto-fix build nel flusso di creazione progetto:
- Dopo la generazione, tenta il build
- Se fallisce, manda l'errore all'AI e chiede di fixare (max 3 tentativi)
- Ma si limita a errori di compilazione — NON verifica che la preview funzioni visivamente

---

## ANALISI 1: Come rendere Cloud Mode funzionante al 100%

### Il problema core

Cloud mode oggi è "best effort": il prompt dice all'AI di usare Supabase, ma il codice generato potrebbe avere errori, tabelle mancanti, query sbagliate, auth non funzionante. Non c'è verifica.

### La soluzione: Template garantiti + Schema pre-generato

Invece di sperare che l'AI generi codice Supabase corretto, dobbiamo **garantire** che certe funzionalità funzionino:

#### Passo 1: Auth come template fisso, non generato dall'AI

```
templates/nextjs-cloud/
├── lib/supabase.ts                    ← GIA' ESISTE
├── app/(auth)/login/page.tsx          ← DA CREARE (template fisso)
├── app/(auth)/register/page.tsx       ← DA CREARE (template fisso)
├── app/(auth)/layout.tsx              ← DA CREARE (redirect se loggato)
├── middleware.ts                       ← DA CREARE (protezione route)
├── components/AuthProvider.tsx         ← DA CREARE (context con session)
├── components/UserMenu.tsx            ← DA CREARE (avatar + logout)
```

**Perche template fisso e non AI-generated**: Perche l'auth DEVE funzionare al primo colpo. Un form di login generato dall'AI potrebbe non gestire errori, non fare redirect, non salvare la sessione. Un template testato e fisso funziona sempre.

L'AI poi personalizza lo stile (colori, layout) ma la logica auth resta quella del template.

#### Passo 2: Schema Supabase pre-configurato per tipo di app

Invece di far generare schema.sql all'AI (che potrebbe sbagliare tipi, relazioni, RLS), creare schemi base per i casi d'uso comuni:

```
templates/schemas/
├── ecommerce.sql        → products, orders, order_items, users, addresses
├── blog.sql             → posts, comments, categories, users
├── social.sql           → profiles, posts, follows, likes, comments
├── saas.sql             → users, teams, subscriptions, invoices
├── marketplace.sql      → listings, bids, reviews, users
├── booking.sql          → services, appointments, users, reviews
```

L'AI riceve lo schema come contesto e genera il codice che lo usa. Non deve inventare lo schema — deve solo usarlo.

#### Passo 3: Supabase SEMPRE attivo in cloud mode

Eliminare il fallback SQLite silenzioso. Se cloud mode è attivo:
- Supabase DEVE essere creato
- Se la creazione fallisce → errore esplicito all'utente ("Cloud mode non disponibile, riprova")
- MAI cadere silenziosamente su SQLite

#### Passo 4: Estendere cloud mode a tutti i framework

Oggi solo Next.js ha un template Supabase nativo. Servono:
- `react-cloud/` con Supabase (non Express + SQLite)
- `vue-cloud/` con Supabase
- `nuxt-cloud/` con Supabase
- Almeno i 4 framework principali

---

## ANALISI 2: Agente che fa screenshot, verifica, e sistema tutto

### Cosa manca oggi

L'agente oggi:
1. Genera codice
2. (Opzionale) Tenta build — se errore, prova a fixare
3. Fine

L'agente NON:
- Avvia il dev server per verificare
- Guarda la preview
- Fa screenshot
- Naviga l'app per testare le pagine
- Verifica che login funzioni
- Verifica che le pagine esistano e non siano bianche

### L'architettura del Self-Healing Agent

```
UTENTE: "Fammi un e-commerce per scarpe"
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    FASE 1: GENERA                        │
│                                                          │
│  1. Crea progetto Supabase                              │
│  2. Applica template (nextjs-cloud + ecommerce.sql)     │
│  3. AI genera pagine, componenti, stili                 │
│  4. Scrive tutti i file                                 │
│                                                          │
│  UI: "Sto creando il tuo progetto..."                   │
│       [████████░░░░░░░░] 40%                            │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    FASE 2: BUILD                         │
│                                                          │
│  1. npm install                                         │
│  2. npm run build                                       │
│  3. Se errore → AI legge errore → fix → retry (max 3)  │
│                                                          │
│  UI: "Installando dipendenze..."                        │
│       "Building..." / "Errore trovato → Corretto"       │
│       [██████████████░░] 70%                            │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    FASE 3: PREVIEW + SCREENSHOT          │
│                                                          │
│  1. Avvia dev server (npm run dev)                      │
│  2. Aspetta che il server risponda (health check)       │
│  3. Per ogni pagina principale (/, /login, /products):  │
│     a. Naviga alla pagina                               │
│     b. Fa screenshot via WebView                        │
│     c. Manda screenshot all'AI (Claude Vision)          │
│     d. AI analizza: "La pagina è OK" / "Problema: ..."  │
│     e. Se problema → AI genera fix → riapplica          │
│  4. Ripete fino a tutte le pagine OK (max 3 cicli)     │
│                                                          │
│  UI: "Verifico che tutto funzioni..."                   │
│       "Homepage ✓ Login ✓ Prodotti ✓"                   │
│       [████████████████] 95%                            │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│                    FASE 4: CONSEGNA                      │
│                                                          │
│  1. Preview live all'utente                             │
│  2. "La tua app è pronta!"                              │
│  3. Riepilogo: 4 pagine, auth funzionante, DB attivo   │
│                                                          │
│  UI: [████████████████] 100%                            │
│       "La tua app è pronta! Navigala qui sotto."        │
└─────────────────────────────────────────────────────────┘
```

### Come implementare gli screenshot

**react-native-webview** supporta già la cattura di contenuto via JavaScript injection. Ecco come:

#### Opzione A: Screenshot via html2canvas (nel WebView)

Iniettare html2canvas nel WebView e catturare il rendering:

```javascript
// Iniettato nel WebView
const script = document.createElement('script');
script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
script.onload = () => {
  html2canvas(document.body).then(canvas => {
    const dataUrl = canvas.toDataURL('image/png');
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'SCREENSHOT',
      image: dataUrl // base64
    }));
  });
};
document.head.appendChild(script);
```

**Pro**: Funziona su qualsiasi pagina, nessuna dipendenza nativa.
**Contro**: html2canvas non cattura tutto perfettamente (canvas, video, iframe).

#### Opzione B: Screenshot lato server (Puppeteer nel container)

Il container Docker ha già Node.js. Installare Puppeteer headless:

```javascript
// Nel container, endpoint /screenshot
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 }); // iPhone viewport
await page.goto('http://localhost:3000');
await page.waitForNetworkIdle();
const screenshot = await page.screenshot({ encoding: 'base64' });
// Manda a Claude Vision per analisi
```

**Pro**: Screenshot perfetto, pixel-accurate, funziona con tutto.
**Contro**: Puppeteer nel container Docker aggiunge ~200MB. Più lento.

#### Opzione C (RACCOMANDATA): Screenshot lato server con Playwright

Playwright è più leggero di Puppeteer per container Docker:

```javascript
// Backend endpoint: POST /agent/screenshot
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`http://localhost:3000${path}`);
await page.waitForLoadState('networkidle');
const buffer = await page.screenshot();
return buffer.toString('base64');
```

Il flusso diventa:
1. Agente genera codice → build → avvia dev server
2. Agente chiama `POST /agent/screenshot?path=/` → ottiene base64
3. Agente manda screenshot a Claude Vision: "Questa pagina è corretta? Problemi visibili?"
4. Se Claude dice "problema" → agente genera fix → ripete
5. Fa lo stesso per /login, /products, ecc.

**Questo è il flusso più pulito** perché:
- Lo screenshot è pixel-perfect (browser vero, non html2canvas)
- Funziona nel container (nessuna dipendenza dal client mobile)
- L'utente non deve fare nulla — l'agente fa tutto lato server
- L'utente vede solo il risultato finale nella preview mobile

### Il loop di verifica intelligente

L'agente non deve solo "guardare" la pagina. Deve verificare funzionalità:

```
VERIFICA HOMEPAGE:
- [ ] La pagina carica (non pagina bianca)
- [ ] Ha una navbar
- [ ] Ha contenuto visibile
- [ ] Non ci sono errori overlay (Next.js error, Vite error)
- [ ] Le immagini caricano (non broken image icons)

VERIFICA LOGIN:
- [ ] Il form esiste (email + password + submit)
- [ ] Il form ha validazione base (campi required)
- [ ] Submit non crasha (nessun errore console)

VERIFICA PAGINA PRODOTTI (e-commerce):
- [ ] I prodotti sono visibili (non lista vuota)
- [ ] Le card hanno immagine, titolo, prezzo
- [ ] Il bottone "aggiungi al carrello" esiste

VERIFICA PAGAMENTI (se richiesti):
- [ ] Bottone checkout esiste
- [ ] Redirect a Stripe Checkout funziona
- [ ] Pagina di successo/errore esiste
```

Questo non richiede screenshot per tutto. Si può fare con un mix di:
- **Screenshot + Vision** per layout e aspetto visivo
- **JavaScript injection** per verifiche strutturali (elementi esistono? Form ha campi?)
- **Console log capture** per errori runtime

---

## ANALISI 3: App che "funzionano davvero" — Login, DB, Pagamenti

### Il framework "App Funzionante"

Per ogni tipo di app generata, ci sono funzionalità che DEVONO funzionare:

### Livello 1: Ogni app (sempre incluso)

| Funzionalità | Come garantirlo |
|--------------|----------------|
| **Navigazione** | Template fisso con Navbar + routing. AI non deve inventarlo. |
| **Responsive** | Template CSS mobile-first. AI personalizza ma la base è testata. |
| **Pagine reali** | Minimo 4 pagine: Home, About/Info, pagina principale, Contatti |
| **Nessuna pagina bianca** | Verifica screenshot post-generazione |
| **Build senza errori** | Auto-fix loop (già esiste, da rafforzare) |

### Livello 2: App con utenti (cloud mode)

| Funzionalità | Come garantirlo |
|--------------|----------------|
| **Login/Register** | Template fisso Supabase auth. NON generato dall'AI. |
| **Sessione persistente** | AuthProvider nel template con `supabase.auth.getSession()` |
| **Protezione route** | Middleware nel template che redirecta a /login |
| **Logout** | UserMenu component nel template |
| **Database reale** | Supabase PostgreSQL con schema pre-definito per tipo app |
| **Dati reali (non fake)** | Schema include INSERT di dati seed |

### Livello 3: E-commerce (quando l'utente lo chiede)

| Funzionalità | Come garantirlo |
|--------------|----------------|
| **Catalogo prodotti** | Schema `products` con seed data. Query Supabase nel template. |
| **Carrello** | Template component: addToCart, removeFromCart, cartTotal |
| **Checkout con Stripe** | Template con Stripe Checkout Session (vedi sotto) |
| **Pagina successo/cancellazione** | Template /success e /cancel pages |
| **Webhook per ordini** | Template /api/webhooks/stripe endpoint |

### Implementazione Stripe

Per far funzionare Stripe al primo colpo, serve:

#### 1. Credenziali Stripe (come Supabase)

Aggiungere al flusso di cloud mode:

```
Opzione A: L'utente inserisce le sue Stripe keys
- Campo nell'UI: "Stripe Publishable Key" + "Stripe Secret Key"
- Salvate in .env.local
- L'utente le prende dalla dashboard Stripe (test mode)

Opzione B: Drape fornisce Stripe test keys (durante beta)
- Drape ha un account Stripe Connect
- Genera restricted API keys per ogni progetto
- L'utente testa con carte fake, poi collega il suo account per produzione
```

**Opzione A è più semplice e realistica per ora.** L'utente che vuole pagamenti sa cos'è Stripe e ha un account.

#### 2. Template Stripe fisso

```
templates/stripe/
├── app/api/checkout/route.ts
│   → Crea Stripe Checkout Session
│   → Redirect a Stripe hosted checkout page
│   → Parametri: line_items dal carrello, success_url, cancel_url
│
├── app/api/webhooks/stripe/route.ts
│   → Verifica firma webhook
│   → Gestisce checkout.session.completed
│   → Aggiorna ordine in Supabase (status: paid)
│
├── app/success/page.tsx
│   → "Pagamento completato! Il tuo ordine è confermato."
│
├── app/cancel/page.tsx
│   → "Pagamento annullato. Torna al carrello."
│
├── components/CheckoutButton.tsx
│   → Chiama /api/checkout con i prodotti nel carrello
│   → Redirect a Stripe Checkout
│
├── lib/stripe.ts
│   → new Stripe(process.env.STRIPE_SECRET_KEY)
```

Questo template viene sovrapposto quando:
- L'utente abilita cloud mode
- La descrizione contiene "e-commerce", "shop", "negozio", "pagamenti", "vendita"

L'AI poi personalizza le pagine prodotto, il catalogo, ecc. Ma il flusso di pagamento è garantito dal template.

#### 3. .env.local per Stripe

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

L'utente le inserisce nell'UI (come fa già con GitHub token). Oppure le aggiunge dopo nel pannello environment variables.

---

## PIANO DI IMPLEMENTAZIONE CONCRETO

### Fase 1 (Settimana 1-2): Self-Healing con Screenshot

**Backend:**
1. Aggiungere Playwright al container Docker OpenCode
2. Creare endpoint `POST /agent/screenshot` che:
   - Naviga a una URL nel dev server
   - Aspetta networkidle
   - Fa screenshot (viewport 390x844)
   - Ritorna base64
3. Creare endpoint `POST /agent/verify-page` che:
   - Fa screenshot
   - Manda a Claude Vision con prompt: "Analizza questa pagina web. Ci sono problemi visivi? Pagina bianca? Errori? Layout rotto? Elementi mancanti?"
   - Ritorna verdetto + descrizione problemi
4. Integrare nel flusso di creazione:
   - Dopo build riuscito → avvia dev server
   - Per ogni pagina principale → screenshot → verify
   - Se problemi → manda all'AI per fix → rebuild → re-verify (max 3 cicli)

**Frontend:**
5. Aggiornare UI creazione con step tracker:
   - "Generando codice..." → "Building..." → "Verificando pagine..." → "Pronta!"
   - Mostra nome pagina verificata con check verde/rosso
   - Se errore corretto: "Errore in /products → Corretto automaticamente"

**Stima effort**: 5-7 giorni di lavoro backend, 2-3 giorni frontend.

### Fase 2 (Settimana 2-3): Auth Template Fisso

**Template:**
1. Creare auth template robusto per Next.js:
   - /login, /register con form, validazione, error handling
   - AuthProvider con context
   - Middleware per protezione route
   - UserMenu component
2. Testare manualmente: login, register, logout, sessione persistente, redirect
3. Replicare per React (Supabase client-side), Vue, Nuxt

**Backend:**
4. Modificare flusso cloud mode:
   - Se cloud mode → auth template SEMPRE applicato
   - Prompt AI aggiornato: "Auth pages already exist. DO NOT regenerate them. Customize their styling to match the app theme."
   - Eliminare fallback SQLite silenzioso

**Stima effort**: 3-4 giorni template + 2 giorni integrazione.

### Fase 3 (Settimana 3-4): Stripe Template + Schemi DB

**Template:**
1. Creare template Stripe (checkout, webhook, success/cancel)
2. Creare schemi SQL per tipi di app (ecommerce, blog, social, saas, booking)
3. Aggiungere campo nell'UI per Stripe keys (opzionale, solo se e-commerce)

**Backend:**
4. Rilevamento automatico tipo app dalla descrizione:
   ```
   "negozio di scarpe" → tipo: ecommerce → schema: ecommerce.sql + stripe template
   "blog personale" → tipo: blog → schema: blog.sql
   "app fitness" → tipo: saas → schema: saas.sql
   ```
5. Applicare schema + template appropriato automaticamente

**Frontend:**
6. Step aggiuntivo in cloud mode: "Vuoi accettare pagamenti?" → input Stripe keys
7. Alternativa: "Configura dopo" → le chiavi possono essere aggiunte nel pannello env vars

**Stima effort**: 4-5 giorni template Stripe + schemi, 2-3 giorni UI.

### Fase 4 (Settimana 4): Project Memory + Polish

1. Espandere `.drape/context.json` con stato progetto completo
2. Verifiche post-modifica (non solo post-creazione)
3. Polish UI step tracker
4. Test end-to-end di tutto il flusso

---

## L'ESPERIENZA FINALE DEL VIBECODER

### Scenario: "Fammi un negozio online di scarpe"

```
UTENTE: "Fammi un negozio online di scarpe"

DRAPE:
├── "Sto creando il tuo negozio..."
├── Rileva: tipo=ecommerce
├── Crea progetto Supabase (DB PostgreSQL)
├── Applica template Next.js + Cloud + Auth + Stripe
├── Applica schema ecommerce.sql (products, orders, users, addresses)
├── AI genera: Home, Catalogo, Dettaglio Prodotto, Carrello, Checkout, Chi Siamo, Contatti
├── Tutti i prodotti hanno dati reali dal DB (seed data: 10+ scarpe con foto Unsplash)
├── "Building..."
├── "Verifico le pagine..."
│   ├── Homepage ✓ (screenshot → Claude: "Pagina OK, catalogo visibile")
│   ├── Login ✓ (form presente, submit funziona)
│   ├── Prodotti ✓ (card con immagini, prezzi, bottone carrello)
│   ├── Carrello ✓ (prodotti visibili, totale, bottone checkout)
│   └── Checkout → Problema: redirect Stripe fallisce
│       └── Fix automatico → Ri-verifica → ✓
├── "Il tuo negozio è pronto!"
│
│   [Preview live del negozio]
│   ✓ 6 pagine funzionanti
│   ✓ Login e registrazione attivi
│   ✓ 12 prodotti nel catalogo (dati reali)
│   ✓ Carrello funzionante
│   ✓ Pagamenti Stripe configurati (test mode)
│
│   [Tutto OK] [Modifica qualcosa]

UTENTE: "Cambia i colori in nero e oro"
DRAPE: → fatto, preview aggiornata.

UTENTE: "Aggiungi una sezione recensioni"
DRAPE: → aggiunta con dati seed, verifica screenshot, tutto OK.
```

**Questo è il momento in cui Drape smette di essere "un generatore" e diventa "il posto dove il tuo business digitale prende vita".**

---

## RISCHI E MITIGAZIONI

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Playwright nel container è pesante (~200MB) | Aumenta tempo creazione + costi server | Usare Playwright solo per verifica, non per ogni interazione. Pre-installare nell'immagine Docker. |
| Claude Vision costa per screenshot | Costo AI aumenta per progetto | Limitare a 5-6 screenshot per creazione. Usare verification JS-based dove possibile, Vision solo per check visivo. |
| Supabase free tier ha limiti | Max 2 progetti gratuiti per org | Creare Supabase org per Drape, gestire pool di progetti. Oppure: 1 progetto Supabase per utente, multi-schema. |
| Stripe richiede account utente | Frizione: l'utente deve avere Stripe | Stripe test mode non richiede verifica. Mostrare: "Configura dopo per accettare pagamenti reali". |
| Template fissi limitano personalizzazione | L'app generata sembra "template" | L'AI personalizza stile, colori, contenuti. Solo la logica (auth, pagamenti) è fissa. |

---

## PRIORITA' ASSOLUTE (in ordine)

1. **Self-healing agent con screenshot** — Senza questo, niente "app funzionante garantita"
2. **Auth template fisso** — Il login è la feature #1 che deve funzionare
3. **Cloud mode 100% Supabase** — Niente fallback SQLite silenzioso
4. **Schemi DB per tipo app** — Dati reali, non fake
5. **Template Stripe** — E-commerce funzionante con pagamenti veri
6. **Step tracker UI** — L'utente vede il progresso e si fida

Tutto il resto viene dopo.
