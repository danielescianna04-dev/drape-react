# Database per ogni progetto — Analisi costi e opzioni

> Problema: Supabase Cloud costa $25/mese per progetto (tier Pro) o ha limite di 2 progetti free per org.
> Se 100 utenti creano 100 progetti, sono $2,500/mese solo di database. Insostenibile.
> Obiettivo: DB reale per ogni progetto generato, a costo ~$0 per progetto.

---

## INFRASTRUTTURA ATTUALE

- **Server**: Hetzner VPS (77.42.1.116) con NVMe
- **Storage**: `/data/projects` montato direttamente — i file persistono tra restart container
- **Container**: Docker per ogni progetto, mount del progetto su NVMe
- **Metadata**: Firebase Firestore (solo metadati progetto, non dati app)
- **DB attuale**: Supabase Cloud (cloud mode) oppure SQLite nel container (fallback)

**Fatto importante**: I file SQLite nella directory progetto `/data/projects/{id}/` PERSISTONO tra restart del container. Il container muore dopo 15 min di idle, ma i file restano sul disco NVMe.

---

## LE OPZIONI — Dalla più economica alla più costosa

### OPZIONE 1: PostgreSQL self-hosted su Hetzner (RACCOMANDATA)

**Costo: ~€5-10/mese** (un VPS Hetzner dedicato per il DB, o sulla stessa macchina)

**Come funziona:**
- Un'istanza PostgreSQL sulla tua infrastruttura Hetzner
- Ogni progetto utente = un DATABASE separato dentro PostgreSQL
- PostgreSQL gestisce migliaia di database su una singola istanza senza problemi
- Credenziali uniche per ogni progetto

```
Progetto "negozio-mario" → DATABASE negozio_mario_a1b2c3
Progetto "blog-anna"     → DATABASE blog_anna_d4e5f6
Progetto "fitness-luca"  → DATABASE fitness_luca_g7h8i9
```

**Setup per ogni progetto:**
```sql
CREATE DATABASE project_a1b2c3;
CREATE USER project_a1b2c3_user WITH PASSWORD 'random_generated';
GRANT ALL ON DATABASE project_a1b2c3 TO project_a1b2c3_user;
```

**Env nel progetto generato:**
```
DATABASE_URL=postgresql://project_a1b2c3_user:pass@db.drape.app:5432/project_a1b2c3
```

**Capacità su un VPS Hetzner CX22 (€5.49/mese, 4GB RAM, 40GB NVMe):**
- ~500-1000 database piccoli (< 50MB ciascuno)
- ~100 connessioni concorrenti
- Scalabile: upgrade VPS o aggiungi replica

**Pro:**
- Costo fisso, non per progetto
- PostgreSQL completo (JSON, full-text search, extensions)
- Stessa infrastruttura che usi già
- I progetti deployati possono continuare a usare lo stesso DB (o migrare)
- Nessuna dipendenza da servizi terzi

**Contro:**
- Devi gestire backup, aggiornamenti, monitoring
- No auth built-in (serve soluzione separata)
- No realtime built-in

**Per l'auth**: Usa Auth.js (ex NextAuth) — è gratuito, open source, funziona con PostgreSQL, supporta Google/GitHub/Apple/email login. Template fisso nel boilerplate.

---

### OPZIONE 2: Turso (SQLite cloud) — IL PIU' ECONOMICO IN ASSOLUTO

**Costo: $0 per 500 database, $29/mese per 10,000 database**

**Cos'è**: SQLite hostato in cloud con replica globale. Stesso linguaggio SQL che usi già nel fallback SQLite.

**Come funziona:**
- Ogni progetto utente = un database Turso separato
- API per creare database programmaticamente
- Client: `@libsql/client` (5KB, zero-config)
- Compatibile con Drizzle ORM e Prisma

**Pricing reale:**

| Tier | Database | Storage | Reads | Prezzo |
|------|----------|---------|-------|--------|
| Starter (free) | 500 | 9 GB | 1B rows/mese | $0 |
| Scaler | 10,000 | 24 GB | 5B rows/mese | $29/mese |
| Pro | 50,000+ | Custom | Custom | Custom |

**Con 500 database gratis puoi servire 500 progetti a costo zero.**

**Setup per ogni progetto (API call):**
```bash
# Crea database
curl -X POST https://api.turso.tech/v1/organizations/{org}/databases \
  -H "Authorization: Bearer $TURSO_API_TOKEN" \
  -d '{"name": "project-a1b2c3", "group": "default"}'

# Crea token di accesso
curl -X POST .../databases/project-a1b2c3/auth/tokens
```

**Env nel progetto generato:**
```
TURSO_DATABASE_URL=libsql://project-a1b2c3-drape.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

**Codice nel template:**
```typescript
// lib/db.ts
import { createClient } from '@libsql/client';
export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
```

**Pro:**
- 500 database GRATIS — zero costo per i primi 500 progetti
- SQLite-compatibile (già avete il fallback SQLite, la migrazione è minima)
- Zero gestione infrastruttura
- API per creare/eliminare database programmaticamente
- Replica globale (veloce ovunque)
- Scale to zero (nessun costo compute quando idle)

**Contro:**
- SQLite, non PostgreSQL (alcune feature avanzate mancano: JSONB, extensions)
- Relativamente nuovo (fondato 2023, ma stabile)
- No auth built-in
- No realtime built-in

---

### OPZIONE 3: Neon Postgres (serverless)

**Costo: $0 per 10 progetti, $19/mese base poi pay-as-you-go**

**Cos'è**: PostgreSQL serverless che scala a zero. Paga solo per compute attivo.

**Pricing:**

| Tier | Progetti | Storage | Compute | Prezzo |
|------|----------|---------|---------|--------|
| Free | 10 | 0.5 GB/progetto | 191h/mese | $0 |
| Launch | 100 | 10 GB/progetto | 300h/mese | $19/mese |
| Scale | 1000 | 50 GB/progetto | 750h/mese | $69/mese |

**Pro:**
- PostgreSQL vero (stesse query di Supabase)
- Scale to zero (zero compute quando nessuno usa il progetto)
- API per creare database programmaticamente
- Branch per preview/staging

**Contro:**
- 10 progetti free è pochissimo
- A 100+ progetti, il costo sale ($19+ per database attivi)
- Cold start di ~500ms quando scala da zero
- No auth/realtime built-in

---

### OPZIONE 4: Supabase Self-Hosted su Hetzner

**Costo: ~€15-30/mese per il VPS (8-16GB RAM necessari)**

**Cos'è**: Tutta la stack Supabase (PostgreSQL + GoTrue Auth + Realtime + Storage + PostgREST) su un tuo server.

**Come funziona:**
- Docker Compose ufficiale di Supabase
- Stessa API di Supabase Cloud → i template attuali funzionano senza modifiche
- Auth con GoTrue gratuito e self-hosted
- Realtime gratuito

**Il problema**: Supabase self-hosted è pensato per UNA istanza = UN progetto. Per multi-tenant (molti utenti, molti database) dovresti:
- Gestire schema separati per ogni progetto
- Oppure: un'istanza Supabase per ogni N utenti (complesso)
- La gestione operativa è significativa (molti servizi Docker)

**Pro:**
- API identica a Supabase Cloud (zero modifiche ai template)
- Auth + Realtime + Storage inclusi
- Costo fisso

**Contro:**
- Richiede 8-16GB RAM per la stack completa
- Complessità operativa alta (7+ container Docker)
- Multi-tenant non è nativo
- Aggiornamenti e manutenzione pesanti

---

## CONFRONTO DIRETTO

| | PostgreSQL Hetzner | Turso | Neon | Supabase Self-Hosted |
|---|---|---|---|---|
| **Costo per 100 progetti** | €5-10/mese (fisso) | $0 (free tier) | $19-69/mese | €15-30/mese |
| **Costo per 1000 progetti** | €10-20/mese | $29/mese | $69+/mese | €30+/mese |
| **Setup per progetto** | CREATE DATABASE | API call | API call | Schema setup |
| **Auth inclusa** | No (usa Auth.js) | No (usa Auth.js) | No (usa Auth.js) | Si (GoTrue) |
| **Realtime** | No (usa WebSocket) | No | No | Si |
| **SQL completo** | Si (PostgreSQL) | SQLite | Si (PostgreSQL) | Si (PostgreSQL) |
| **Gestione infra** | Media | Zero | Zero | Alta |
| **Modifica ai template** | Media | Minima* | Media | Nessuna |
| **Rischio vendor lock** | Zero | Basso | Basso | Zero |

*Minima perché avete già il fallback SQLite — Turso è SQLite cloud.

---

## LA MIA RACCOMANDAZIONE

### Per ADESSO (MVP, primi 500 utenti): TURSO

Perche:
1. **500 database gratis** — non spendi nulla fino a 500 progetti
2. **SQLite-compatibile** — avete già il codice SQLite nel fallback, la migrazione è minima
3. **Zero infrastruttura** — non devi gestire nulla, API per creare/eliminare DB
4. **Scale to zero** — progetti inattivi non costano
5. **Quando cresci**: $29/mese per 10,000 database è ridicolmente economico

### Per DOPO (quando hai 1000+ utenti attivi): PostgreSQL su Hetzner

Perche:
1. Costo fisso e prevedibile
2. PostgreSQL completo per feature avanzate
3. Pieno controllo
4. Ma richiede un DevOps minimo per gestirlo

### Per AUTH (entrambe le opzioni): Auth.js (ex NextAuth)

Perche:
1. Gratuito, open source
2. Funziona con qualsiasi database (Turso, PostgreSQL, SQLite)
3. Provider OAuth pronti (Google, GitHub, Apple, email/password)
4. Template fisso nel boilerplate → auth funziona sempre
5. Nessun costo per utente

---

## COME CAMBIA IL FLUSSO CON TURSO + AUTH.JS

### Creazione progetto (cloud mode):

```
OGGI:
1. Crea progetto Supabase (1-3 minuti, $0-25/progetto)
2. Scrivi credenziali in .env.local
3. AI genera codice con @supabase/supabase-js
4. Esegui schema.sql via Supabase API

DOMANI (con Turso):
1. Crea database Turso (2-5 secondi, $0)
2. Genera auth token
3. Scrivi credenziali in .env.local:
   TURSO_DATABASE_URL=libsql://project-xxx-drape.turso.io
   TURSO_AUTH_TOKEN=eyJ...
   AUTH_SECRET=random_generated
4. Applica template con Drizzle + Auth.js (pre-configurato)
5. AI genera pagine usando lo schema Drizzle
6. Esegui migrations con drizzle-kit push
```

**Tempo creazione DB: da 1-3 minuti (Supabase) a 2-5 secondi (Turso)**

### Template cloud con Turso + Auth.js:

```
templates/nextjs-cloud/
├── lib/
│   ├── db.ts                    → Turso client + Drizzle ORM
│   └── auth.ts                  → Auth.js config (Google, GitHub, email)
├── db/
│   ├── schema.ts                → Drizzle schema (tabelle base)
│   └── migrations/              → Auto-generate con drizzle-kit
├── app/
│   ├── api/auth/[...nextauth]/  → Auth.js API route
│   ├── (auth)/login/page.tsx    → Login page (template fisso)
│   ├── (auth)/register/page.tsx → Register page (template fisso)
│   └── middleware.ts            → Route protection
├── components/
│   ├── AuthProvider.tsx         → Session context
│   └── UserMenu.tsx             → Avatar + logout
├── drizzle.config.ts            → Drizzle config per Turso
└── .env.local
    ├── TURSO_DATABASE_URL
    ├── TURSO_AUTH_TOKEN
    ├── AUTH_SECRET
    ├── AUTH_GOOGLE_ID (opzionale)
    └── AUTH_GOOGLE_SECRET (opzionale)
```

### Costi reali a volume:

| Utenti | Progetti | DB cost/mese | Auth cost | Totale DB+Auth |
|--------|----------|-------------|-----------|----------------|
| 50 | 100 | $0 (Turso free) | $0 (Auth.js) | **$0** |
| 200 | 500 | $0 (Turso free) | $0 | **$0** |
| 500 | 1000 | $29 (Turso Scaler) | $0 | **$29** |
| 2000 | 5000 | $29 (Turso Scaler) | $0 | **$29** |
| 5000 | 10000 | $29 (Turso Scaler) | $0 | **$29** |

**Confronto con Supabase Cloud:**

| Utenti | Progetti | Supabase cost | Turso cost | Risparmio |
|--------|----------|--------------|------------|-----------|
| 100 | 200 | ~$5,000/mese | $0 | **$5,000** |
| 500 | 1000 | ~$25,000/mese | $29 | **$24,971** |

---

## STRIPE: COME FARLO FUNZIONARE

Il database risolve i dati. Ma per i pagamenti servono le Stripe keys dell'utente.

**Approccio pratico:**

1. **Durante creazione**: Se l'app è e-commerce, mostra step opzionale:
   - "Vuoi attivare i pagamenti? Inserisci le tue Stripe Test Keys"
   - Link diretto a dashboard.stripe.com/test/apikeys
   - Campi: Publishable Key + Secret Key
   - "Puoi configurarli anche dopo nelle impostazioni"

2. **Se l'utente inserisce le keys**: Template Stripe applicato, pagamenti funzionanti in test mode

3. **Se l'utente salta**: Template Stripe applicato con placeholder, bottone checkout dice "Configura Stripe per attivare i pagamenti"

4. **Dopo la creazione**: Pannello Environment Variables per aggiungere keys quando vuole

**Non serve un account Stripe di Drape. L'utente usa il suo.** E in test mode non serve nemmeno verifica.

---

## AZIONE IMMEDIATA — Cosa fare

### Step 1: Crea account Turso e testa
```bash
# Installa CLI
brew install tursodatabase/tap/turso

# Login
turso auth login

# Crea database di test
turso db create test-drape-project

# Ottieni URL
turso db show test-drape-project --url

# Crea token
turso db tokens create test-drape-project
```

### Step 2: Crea template Next.js con Turso + Drizzle + Auth.js
- Sostituisci `@supabase/supabase-js` con `@libsql/client` + `drizzle-orm`
- Sostituisci Supabase Auth con Auth.js
- Testa: login, register, CRUD, tutto funziona?

### Step 3: Crea servizio Turso nel backend (come supabase-management.service.ts)
- `createDatabase(projectName)` → Turso API
- `getCredentials(dbName)` → URL + token
- `deleteDatabase(dbName)` → cleanup
- `runMigrations(dbName, schema)` → applica schema

### Step 4: Aggiorna il flusso cloud mode
- Cloud mode = Turso + Auth.js (non più Supabase)
- Tempo creazione: 2-5 secondi invece di 1-3 minuti
- Credenziali in .env.local automatiche

### Step 5: Aggiungi opzione Stripe
- Rileva "e-commerce"/"shop"/"negozio" nella descrizione
- Mostra step per Stripe keys (opzionale)
- Template Stripe nel boilerplate
