# RALPH LOOP - Sistema Unificato

## COMANDO UNICO

```bash
node backend/cli/ralph.js -p "La tua richiesta" --id nome-progetto
```

### Esempi

```bash
# Crea nuovo progetto
node backend/cli/ralph.js -p "Crea sito per vape shop con carrello" --id vape-1

# Modifica progetto esistente
node backend/cli/ralph.js -p "Aggiungi pagina contatti" --id vape-1

# Chiedi info
node backend/cli/ralph.js -p "Di cosa è questo sito?" --id vape-1
```

---

## FLUSSO COMPLETO

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FLUSSO RALPH LOOP                               │
│                                                                      │
│  1. UTENTE ESEGUE COMANDO                                           │
│     └─ node ralph.js -p "Crea sito vape shop" --id vape-1           │
│                                                                      │
│  2. RALPH LEGGE CONTESTO (se esiste)                                │
│     └─ Legge .drape/project.json                                    │
│                                                                      │
│  3. AI ESEGUE                                                       │
│     └─ Se nuovo progetto: CREA .drape/project.json PRIMA           │
│     └─ Genera/modifica files in base al contesto                    │
│     └─ Usa contenuto REALISTICO per l'industry                      │
│                                                                      │
│  4. RISULTATO                                                       │
│     └─ Progetto creato/modificato                                   │
│     └─ Contesto salvato in .drape/project.json                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## PROMPT UNIFICATO

```
You are DRAPE AI, an autonomous development agent.

## PRIMA DI TUTTO: CONTESTO

SEMPRE prima di generare codice:
1. Leggi .drape/project.json (se esiste)
2. Se non esiste E stai creando un progetto, CREALO PRIMA

## FILE CONTESTO: .drape/project.json

{
  "name": "nome-progetto",
  "description": "Descrizione originale utente",
  "technology": "react",
  "industry": "vape-shop|restaurant|e-commerce|portfolio|blog|general",
  "features": ["cart", "products", "auth", ...],
  "createdAt": "timestamp"
}

## RILEVAMENTO INDUSTRY

- "vape", "svapo", "sigaretta" → vape-shop
- "ristorante", "menu", "pizzeria" → restaurant
- "shop", "negozio", "carrello" → e-commerce
- "portfolio", "cv" → portfolio
- "blog", "articoli" → blog

## REGOLE CONTENUTO

❌ MAI:
- "Product 1", "Lorem ipsum", "Description here"
- "Company Name", "Feature 1", "example.com"

✅ SEMPRE contenuto realistico:

VAPE SHOP:
- Prodotti: "Elf Bar BC5000", "SMOK Nord 5", "Vaporesso XROS 3"
- Categorie: "Dispositivi", "Liquidi", "Accessori"
- Prezzi: €12.99, €24.50
- Design: Scuro (#0d0d0d), neon (#00ff88, #ff00ff)

RISTORANTE:
- Piatti italiani reali
- Sezioni: Antipasti, Primi, Secondi, Dolci
- Design: Caldo, elegante

## STRUTTURA PROGETTO

1. .drape/project.json - SEMPRE PRIMA!
2. index.html - alla ROOT
3. package.json - react, react-dom, react-router-dom
4. vite.config.js - host: '0.0.0.0', port: 3000
5. src/main.jsx, App.jsx, index.css

## TOOLS

- write_file: Crea file
- read_file: Leggi file
- list_directory: Esplora
- run_command: npm, git, etc.
- edit_file: Modifica
- signal_completion: OBBLIGATORIO alla fine!

## FLUSSO

NUOVO PROGETTO:
1. Crea .drape/project.json
2. Crea struttura base
3. Crea componenti con contenuto REALISTICO
4. npm install
5. signal_completion

MODIFICHE:
1. Leggi .drape/project.json
2. Modifica mantenendo stile
3. signal_completion

## PRINCIPIO
"Iteration > Perfection" - Muoviti veloce, correggi errori, itera.
```

---

## API ENDPOINT

Un solo endpoint: `POST /agent/run/fast`

```javascript
// Request
{
  "prompt": "La richiesta dell'utente",
  "projectId": "nome-progetto"
}

// Response: SSE stream con eventi
data: {"type": "start", "projectId": "...", "hasContext": true}
data: {"type": "iteration_start", "iteration": 1}
data: {"type": "tool_start", "tool": "write_file", "input": {...}}
data: {"type": "tool_complete", "success": true}
data: {"type": "complete", "summary": "...", "filesCreated": [...]}
data: {"type": "done"}
```

---

## FILE CREATI

| File | Descrizione |
|------|-------------|
| `backend/services/agent-loop.js` | Classe AgentLoop con loop iterativo |
| `backend/routes/agent.js` | Endpoint SSE `/agent/run/fast` |
| `backend/cli/ralph.js` | CLI semplificato |
| `backend/DRAPE_SYSTEM_PROMPT.md` | Prompt di sistema dettagliato |

---

## RIASSUNTO

**Un comando, un prompt, un flusso:**

```bash
node backend/cli/ralph.js -p "Crea sito vape shop" --id mio-progetto
```

L'AI:
1. Legge/crea `.drape/project.json`
2. Genera codice con contenuto realistico
3. Mantiene il contesto per modifiche future
