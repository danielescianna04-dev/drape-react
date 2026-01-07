# Drape IDE - Schema Costi e Provider

## Provider Utilizzati

### 1. Fly.io (Compute - VM Cloud)
**Uso**: Workstation cloud per gli utenti

| Risorsa | Spec | Costo/ora | Costo/mese (8h/giorno) |
|---------|------|-----------|------------------------|
| shared-cpu-1x | 1 CPU, 256MB | ~$0.0035 | ~$0.85 |
| shared-cpu-2x | 2 CPU, 512MB | ~$0.007 | ~$1.70 |
| dedicated-cpu-1x | 1 CPU, 2GB | ~$0.03 | ~$7.20 |

**Stima per utente attivo**: $2-5/mese

---

### 2. Firebase (Auth + Database)
**Uso**: Autenticazione, Firestore per progetti utente

| Servizio | Free Tier | Oltre Free |
|----------|-----------|------------|
| Auth | 50k MAU | $0.0055/MAU |
| Firestore Reads | 50k/giorno | $0.036/100k |
| Firestore Writes | 20k/giorno | $0.108/100k |
| Storage | 5GB | $0.026/GB |

**Stima per utente**: $0.10-0.50/mese

---

### 3. Google Cloud / Gemini API
**Uso**: AI assistente, generazione codice

| Modello | Input | Output |
|---------|-------|--------|
| Gemini 1.5 Flash | $0.075/1M token | $0.30/1M token |
| Gemini 1.5 Pro | $1.25/1M token | $5.00/1M token |
| Gemini 2.0 Flash | $0.10/1M token | $0.40/1M token |

**Stima per utente** (uso medio 100k token/mese): $0.05-0.50/mese

---

### 4. Redis (Opzionale - State Management)
**Uso**: Cache, stato workstation

| Provider | Free Tier | Piano Base |
|----------|-----------|------------|
| Upstash | 10k cmd/giorno | $0.20/100k cmd |
| Redis Cloud | 30MB | $5/mese (100MB) |

**Stima**: $0-5/mese (scalabile)

---

### 5. Dominio + SSL
| Servizio | Costo |
|----------|-------|
| Dominio .com | ~$12/anno |
| Cloudflare (SSL + CDN) | Gratis |

---

## Riepilogo Costi per Utente

| Componente | Min | Max | Media |
|------------|-----|-----|-------|
| Fly.io VM | $2 | $10 | $4 |
| Firebase | $0.10 | $0.50 | $0.30 |
| Gemini API | $0.05 | $1 | $0.30 |
| Redis | $0 | $0.50 | $0.10 |
| **TOTALE** | **$2.15** | **$12** | **$4.70** |

---

## Piani Subscription Proposti

### Free (Beta/Trial)
- **Prezzo**: €0
- **Limiti**:
  - 1 progetto
  - 5 ore VM/mese
  - AI limitato (20 richieste/giorno)
- **Margine**: Negativo (lead generation)

### Starter
- **Prezzo**: €9.99/mese
- **Include**:
  - 3 progetti
  - 30 ore VM/mese
  - AI illimitato (Flash)
- **Costo stimato**: ~€4
- **Margine**: ~€6 (60%)

### Pro
- **Prezzo**: €19.99/mese
- **Include**:
  - 10 progetti
  - 100 ore VM/mese
  - AI Pro (Gemini Pro)
  - Collaborazione
- **Costo stimato**: ~€8
- **Margine**: ~€12 (60%)

### Team
- **Prezzo**: €49.99/mese (per 5 utenti)
- **Include**:
  - Progetti illimitati
  - VM dedicate
  - AI Pro
  - Supporto prioritario
- **Costo stimato**: ~€25
- **Margine**: ~€25 (50%)

---

## Break-Even Analysis

| Scenario | Utenti Paganti | MRR | Costi | Profitto |
|----------|----------------|-----|-------|----------|
| Minimo | 50 Starter | €500 | €200 | €300 |
| Target | 100 misto | €1.500 | €500 | €1.000 |
| Crescita | 500 misto | €7.500 | €2.500 | €5.000 |

**Break-even stimato**: ~30-50 utenti paganti

---

*Ultimo aggiornamento: 2026-01-06*
*Nota: I prezzi dei provider sono soggetti a variazioni. Verificare sempre i listini ufficiali.*
