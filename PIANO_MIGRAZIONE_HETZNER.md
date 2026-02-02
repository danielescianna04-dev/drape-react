# Piano Migrazione: da Fly.io a Hetzner + Docker

## Panoramica Non Tecnica

### Cosa cambia?
Oggi ogni workspace utente gira su una "mini macchina virtuale" affittata da Fly.io, un servizio cloud. Ogni macchina ha poca potenza (2 core condivisi, 2GB RAM) e costa ~€12/mese ciascuna, anche da ferma.

Con il nuovo sistema, affittiamo **3 server fisici potenti** da Hetzner e ci mettiamo sopra tanti "container" (ambienti isolati) quanti ne servono. È come passare da 50 monolocali in affitto a 3 ville dove crei stanze a piacimento.

### Perché?
- **Più veloce**: la preview parte in 20-40 secondi invece di 2-5 minuti
- **Più economico**: €297/mese invece di €600/mese per 50 utenti
- **Più risorse**: ogni container ha 4 core reali e 7GB RAM (oggi: 2 core condivisi e 2GB)

### Per l'utente finale cosa cambia?
L'utente preme "Avvia Anteprima" e la preview è pronta in ~30 secondi invece di minuti. Tutto il resto resta identico.

---

## Costi Dettagliati

### Setup: 3× Hetzner AX102

| Voce | Dettaglio | Costo/mese |
|---|---|---|
| Server 1 | AX102 (16 core / 128GB / 2× NVMe) | €99 |
| Server 2 | AX102 (16 core / 128GB / 2× NVMe) | €99 |
| Server 3 | AX102 (16 core / 128GB / 2× NVMe) | €99 |
| **Totale** | **48 core / 384GB RAM / 6× NVMe** | **€297/mese** |

### Come funziona la fatturazione Hetzner

- **Server dedicati** (AX): paghi un fisso mensile, sempre acceso
- Il server è tuo 24/7 — non paghi "a container" o "a ora"
- I container sopra sono gratis — sono solo processi sul tuo server
- Puoi averne 10 o 50, il costo del server non cambia
- Se spegni un container, non risparmi nulla (il server resta acceso)
- Se spegni il **server**, non paghi (ma perdi il servizio)

### Container: non hanno costo proprio

| Stato container | Costo aggiuntivo |
|---|---|
| Container attivo (utente usa preview) | €0 (usa risorse del server) |
| Container fermo (utente non usa preview) | €0 (non usa risorse) |
| Creare un nuovo container | €0 (<1 secondo) |
| Distruggere un container | €0 |

Il costo è **fisso a €297/mese**, indipendentemente da quanti container hai.

### Confronto costi Fly.io vs Hetzner

| Scenario | Fly.io | Hetzner |
|---|---|---|
| 15 container (attuale) | €184/mese | €99/mese (1 server) |
| 30 container | €360/mese | €198/mese (2 server) |
| 50 container | €600/mese | €297/mese (3 server) |
| 100 container | €1.200/mese | €396/mese (4 server) |

### Revenue vs Costi (50 utenti piano Go €9.99)

| | Fly.io | Hetzner |
|---|---|---|
| Entrate | €500/mese | €500/mese |
| Costi infrastruttura | €600/mese | €297/mese |
| **Margine** | **-€100/mese (perdita)** | **+€203/mese (40%)** |

---

## Specifiche Tecniche

### Architettura Attuale (Fly.io)

```
┌─────────────┐     ┌──────────┐     ┌──────────┐
│   Backend    │────▶│  VM Pool  │────▶│  Cache   │
│  (Fly App)   │     │ (15 VMs)  │     │  Master  │
└─────────────┘     └──────────┘     └──────────┘
                     │ VM 1: 2 shared CPU, 2GB RAM
                     │ VM 2: 2 shared CPU, 2GB RAM
                     │ ...
                     │ VM 15: 2 shared CPU, 2GB RAM
                     │
                     │ Ogni VM è isolata, comunicazione via rete
                     │ Cache copiata via HTTP (15-25 secondi)
```

**Problemi:**
- CPU condivisa = prestazioni inconsistenti
- 2GB RAM = swap durante compilazione Next.js
- Cache via rete = 15-25 secondi per copiare node_modules
- Costo per VM fisso anche se non usata

### Nuova Architettura (Hetzner + Docker)

```
┌──────────────────────────────────────────────┐
│              Server AX102 #1                  │
│          16 core / 128GB / NVMe               │
│                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │Container│ │Container│ │Container│  ...    │
│  │  User1  │ │  User2  │ │  User3  │        │
│  └────┬────┘ └────┬────┘ └────┬────┘        │
│       │           │           │               │
│  ┌────┴───────────┴───────────┴────────────┐ │
│  │       Volume condiviso NVMe              │ │
│  │  pnpm-store / node_modules cache / .next │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              Server AX102 #2                  │
│          (stessa struttura)                   │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│              Server AX102 #3                  │
│          (stessa struttura)                   │
└──────────────────────────────────────────────┘
```

**Vantaggi:**
- CPU dedicata reale (AMD Ryzen, non virtualizzata)
- RAM abbondante (7GB per container con 50 attivi)
- Cache su volume NVMe locale (3-5 GB/s, zero copie via rete)
- Container si avviano in <1 secondo
- Risorse elastiche: un container può fare burst su tutti i 16 core

### Risorse per container

| Container attivi | CPU/container | RAM/container | Server necessari |
|---|---|---|---|
| 10 | ~8 core (burst) | 12GB | 1× AX102 |
| 20 | ~4 core | 7GB | 2× AX102 |
| 30 | ~3.5 core | 6GB | 2× AX102 |
| 50 | ~4 core | 7GB | 3× AX102 |

### Prestazioni Preview

#### Cold start (primo avvio assoluto, zero cache)

| Fase | Fly.io (oggi) | Hetzner Docker |
|---|---|---|
| Avvio container | 3-5s | <1s |
| Git clone | 10-15s | 1-2s (shallow + NVMe) |
| pnpm install | 60-120s | 20-40s (store pre-popolato: 3-8s) |
| Next.js compilazione | 90-180s | 30-60s (ottimizzato: 15-30s) |
| **Totale** | **3-5 min** | **1-2 min (ottimizzato: 20-40s)** |

#### Warm start (progetto già usato, cache presente)

| Fase | Fly.io (oggi) | Hetzner Docker |
|---|---|---|
| Avvio container | 3-5s | <1s |
| Cache restore | 15-25s (via rete) | 0s (volume mount) |
| pnpm install | 15-20s | 2-3s |
| Next.js start | 60-90s | 5-15s |
| **Totale** | **2-5 min** | **10-20s** |

#### Hot start (stesso progetto, container ancora vivo)

| Fase | Fly.io (oggi) | Hetzner Docker |
|---|---|---|
| Tutto | 2-5 min (uccide e riavvia) | **0s** (server già running) |

---

## Ridondanza e Sicurezza

### Con 3 server

- Se **1 server muore**: gli altri 2 reggono ~35 container. Prestazioni leggermente ridotte ma servizio attivo. Tempo di recovery: Hetzner sostituisce hardware in ~1-4 ore.
- Se **2 server muoiono** (improbabile): 1 server regge ~15-20 container, gli altri in coda.
- **Backup**: snapshot automatici dei volumi (dati utente su Git, quindi il rischio di perdita è minimo).

### Load balancing

Il backend decide su quale server mandare un nuovo container:
1. Controlla quale server ha più risorse libere
2. Crea il container lì
3. Se il server è pieno, usa il successivo

---

## Ottimizzazioni Software (costo: €0)

Queste ottimizzazioni funzionano su qualsiasi infrastruttura ma su Hetzner sono ancora più efficaci:

### 1. pnpm store globale pre-popolato
Volume condiviso con i pacchetti npm più usati già scaricati. pnpm linka invece di scaricare.
**Risparmio: 15-30 secondi su cold start**

### 2. Template container per framework
Immagini Docker pronte: `drape-nextjs`, `drape-react`, `drape-vue` con dipendenze base pre-installate.
**Risparmio: 10-20 secondi su cold start**

### 3. Git clone ottimizzato
`git clone --depth 1 --filter=blob:none` — solo ultimo commit, no storia.
**Risparmio: 5-10 secondi**

### 4. Pre-avvio durante navigazione
Quando l'utente apre un progetto (prima di premere "Avvia Anteprima"), il container inizia già a prepararsi in background.
**Risparmio: l'utente non aspetta**

### 5. Container persistenti
Il container non viene distrutto subito dopo l'uso. Resta vivo per 30 minuti — se l'utente torna, la preview è istantanea (0 secondi).
**Risparmio: elimina completamente l'attesa per utenti che tornano**

---

## Piano di Migrazione

### Fase 1: Setup infrastruttura
- Ordinare 1× AX102 su Hetzner
- Installare Docker, configurare rete, volumi NVMe
- Creare immagine Docker base (equivalente attuale Fly VM)
- Configurare firewall e accesso SSH

### Fase 2: Adattare il backend
- Modificare `workspace-orchestrator.js` per gestire container Docker via Docker API invece di Fly.io Machines API
- Modificare `fly-service.js` → `docker-service.js`
- Sostituire chiamate Fly API con comandi Docker (create, start, stop, remove)
- Implementare volume mounts per cache condivisa
- Aggiornare health check per container locali

### Fase 3: Testing parallelo
- Tenere Fly.io attivo come fallback
- Dirigere utenti beta sui container Hetzner
- Confrontare prestazioni reali vs attese
- Verificare stabilità sotto carico

### Fase 4: Migrazione completa
- Spostare tutto il traffico su Hetzner
- Spegnere VM Fly.io
- Aggiungere secondo e terzo server secondo necessità

### Fase 5: Ottimizzazioni
- Implementare pnpm store globale
- Creare template container per framework
- Aggiungere pre-warm e container persistenti
- Monitoraggio e alerting

---

## Riepilogo Finale

| | Oggi (Fly.io) | Domani (Hetzner + Docker) |
|---|---|---|
| Infrastruttura | 15 VM separate | 3 server fisici + container |
| CPU per utente | 2 core condivisi | 4 core reali |
| RAM per utente | 2GB | 7GB |
| Avvio preview | 2-5 minuti | 20-40 secondi |
| Costo (50 utenti) | €600/mese | €297/mese |
| Margine (50 utenti Go) | -20% (perdita) | +40% |
| Scalabilità | +1 VM = +€12 | +1 server = +€99 (~15 utenti) |
