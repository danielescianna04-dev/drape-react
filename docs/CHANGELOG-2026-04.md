# Changelog — Aprile 2026

## Subdomain Preview System
- **Wildcard DNS**: `*.drape.info` → server Hetzner
- **Wildcard SSL**: Let's Encrypt con certificato per `*.drape.info`
- **Nginx**: `preview-wildcard.conf` — proxy `project-xxx.drape.info` → container locale
- **Backend**: `createSubdomainPreviewProxy()` in `vm-router.ts`
- **Frontend**: `PreviewWebView` e `usePreviewServerLifecycle` aggiornati per URL subdomain
- Cache buster iOS (`&_=timestamp`) stripped dal proxy path

## Next.js Production Mode
- `next build && next start` come comando di default (non più `next dev`)
- Auto-fix build errors con Sonnet 4.6 (3 tentativi)
- PID limit container: 512 → 1024 per `next build` worker threads
- Tailwind v3/v4 auto-detection: controlla versione installata in `node_modules` e adatta `globals.css` + `postcss.config`

## E2E Verification — Navigation Testing
- **Phase 1**: carica ogni pagina, verifica contenuto/CSS/errori JS/immagini rotte
- **Phase 2**: click-through test su TUTTI gli elementi interattivi (link, bottoni, nav)
  - Detecta redirect loop (es. `/browse` → `/profiles` → loop)
  - Detecta bottoni rotti in gruppi (es. profilo selector che non fa niente)
  - Verifica pagina destinazione non è blank/errore dopo click
  - Nessun limite di click o pagine
- **Auto-fix**: errori di navigazione inviati a Sonnet con contesto completo (store/context files + screenshots)
- Script `e2e-check.js` copiato nei container al warm (non serve rebuild immagine)

## Neon Database Integration
- **Discover**: backend detecta `DATABASE_URL` con `neon.tech` in `.env` / `.env.local`
- **Query**: usa `pg` (node-postgres) dentro il container per query SQL
- **API endpoints**: tables, rows (paginati), schema, SQL editor — tutti supportano `__neon__`
- **Multi-query**: `neonMultiQuery()` esegue N query in un singolo process spawn
- **UI Database tab**:
  - Sezione "Database" nella sidebar (ChatPanel)
  - `TableListView`: lista tabelle con GlassCard, stats (tables/rows/engine)
  - `TableDataView`: vista righe con colonne scrollabili, back button floating nel VSCodeSidebar header
  - `DatabaseDiscovery`: empty state con feature grid (Serverless, Branching, Auth, Edge) e steps per attivare
  - Tutto aggiornato da Supabase → Neon (testi, colori, detect)

## Cloud Mode — Real Data
- Prompt AI aggiornato: in Cloud Mode i dati vengono dalle API routes + DB, non hardcoded
- System prompt condizionale: `SEED DATA` section cambia in base a `cloudMode`
- Seed data va in `db/schema.sql` come INSERT statements
- Pagine usano `useEffect` + `fetch` dalle API routes

## AI Interview (Create Project)
- Step "AI Interview" nel flusso di creazione progetto
- Multi-select chips + text input per domanda
- LiquidGlass sulle card
- Tutte le domande obbligatorie prima di procedere
- Lingua delle domande basata su `i18n.language`

## Custom Start Command
- Campo "Comando" nella card preview start screen
- Salva in `.drape.json` nella root del progetto
- `project-detector.service.ts` legge `.drape.json` e sovrascrive il comando auto-rilevato

## Fix & Improvements
- **Middleware Edge Runtime**: rimosso import `better-auth/cookies` dal middleware template (incompatibile con Edge)
- **Offline overlay**: ping HTTP reale al backend (`/health`) invece di `NetInfo.isInternetReachable` (falsi positivi su iOS)
- **WebSocket errors**: `console.error` → `console.warn` (no red screen in dev)
- **Dependency auto-remove**: rimuove pacchetti npm 404 dal `package.json` al retry install
- **Template CSS**: `@apply border-border` → CSS diretto in tutti i template (astro, react, vue, nextjs)
- **Tailwind CDN**: iniettato come fallback in layout/index.html per tutti gli stack
- **TableDataView loop fix**: `useCallback` deps stabilizzate con `useRef` per `api`
