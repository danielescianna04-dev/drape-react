# Session Notes — 26 Marzo 2026

## Stato attuale

### Cosa funziona:
- Neon DB si crea in 2 sec, auth tables (user/session/account/verification) create automaticamente
- Schema SQL app (tasks, projects, team_members) generato dall'AI con vincoli corretti
- Better Auth signup/login funzionano dal server (testato con curl — 200 OK)
- Auth client con customFetchImpl gestisce il proxy Bynot (signup fa redirect a /dashboard)
- Cleanup DB su delete progetto funziona
- Template protetti: auth files non vengono sovrascritti dall'AI
- String length fix in PreviewPanel.tsx (limite 10MB su XHR SSE)
- deploy.sh fixato per template .ts

### Problemi da risolvere (in ordine):

1. **AI genera troppo poco** — Solo 12 file con contenuto minimalista. Gemini Flash non usa i 100K token. La landing page è "Benvenuto su X / Progetto Next.js pronto per la preview" invece della pagina ricca del template base. Il prompt deve essere molto più specifico su cosa generare.

2. **Schema SQL non viene eseguito** — Il file `db/schema.sql` viene generato ma non trovato in `parsed.files` (forse il parser JSON non lo cattura). Fix implementato: fallback lettura da disco. Da testare.

3. **Vecchi file Supabase nel template** — `app/api/items/` aveva import sbagliato (`import db` default vs `export const db`). Fix: rimossi i vecchi file. Ma il cloud overlay template va ripulito completamente.

4. **Server Components vs Client Components** — Le pagine generate come server components non ricevono il cookie auth dal proxy. Fix: prompt aggiornato per dire "TUTTE le pagine devono essere 'use client'". Da testare.

5. **Cookie auth nel proxy** — Il session cookie di Better Auth (`SameSite=Lax, Path=/`) potrebbe non funzionare correttamente attraverso il proxy perché l'Host header cambia. Fix parziale: trustedOrigins aggiornato. Serve testing.

### Prossimi step prioritari:

1. **Migliorare il prompt di generazione** — L'AI deve generare 20+ file completi, con landing page ricca, dashboard con sidebar, pagine specifiche per l'app, e API routes. Servono esempi concreti nel prompt.

2. **Testare il flusso completo** — Creare un progetto nuovo e verificare: (a) landing page bella, (b) register/login funzionanti, (c) redirect a dashboard, (d) dashboard con dati reali dal DB.

3. **Piano 2: Self-Healing** — Playwright screenshot + Claude Vision per verificare ogni pagina e auto-fixare errori.

4. **Prompt engineering serio** — Studiare come Lovable fa il prompt (design system tokens, shadcn/ui, small focused components, "wow the user"). Adattare per Next.js + Tailwind.

### File chiave modificati oggi:
- `backend-ts/src/services/neon-management.service.ts` — NUOVO
- `backend-ts/src/services/project-creation-prompt.ts` — aggiornato prompt Neon + auth
- `backend-ts/src/routes/workstation.routes.ts` — Neon integration, auth schema, cleanup
- `backend-ts/src/routes/fly.routes.ts` — .env.local reading fix
- `backend-ts/src/middleware/vm-router.ts` — proxy analysis (non modificato)
- `backend-ts/src/config/index.ts` — NEON_API_KEY, NEON_ORG_ID
- `backend-ts/templates/nextjs-cloud/` — 15 file auth template
- `backend-ts/deploy.sh` — rsync include templates
- `src/features/terminal/components/PreviewPanel.tsx` — string length fix
- `docs/superpowers/plans/` — 3 piani + overview
- `STRATEGIA-BYNOT.md`, `ANALISI-TECNICA-DEEP.md`, `ANALISI-DATABASE-COSTI.md`
