# BUG: AI Non Conosce il Contesto del Progetto

## Problema

1. **Alla creazione**: L'utente inserisce una descrizione (es. "vape shop con carrello"), ma l'AI crea un template generico invece di generare in base alla descrizione.

2. **Nella chat**: Se l'utente chiede "di cosa è questo sito?", l'AI non sa rispondere correttamente.

## Comportamento Corretto

### Fase 1: Creazione Progetto
- Utente inserisce descrizione: "Voglio un sito per vape shop con carrello"
- AI DEVE generare il sito IN BASE alla descrizione
- NON usare template generico

### Fase 2: Dentro il Progetto
- L'utente è LIBERO di modificare tutto
- Se l'utente cambia idea e trasforma il vape shop in un ristorante, va bene
- L'AI NON deve rimanere "bloccata" sulla descrizione originale

### Fase 3: Domande sul Progetto
Quando l'utente chiede "cosa fa questo progetto?":
- L'AI deve guardare il **CODICE REALE** del progetto
- Deve rispondere in base a cosa c'è EFFETTIVAMENTE nei file
- NON deve rispondere basandosi solo sulla descrizione originale (che potrebbe essere obsoleta)

## Esempio

```
CREAZIONE:
Utente: "Crea sito vape shop"
AI: Genera sito vape shop con prodotti, carrello, design scuro

DOPO (utente modifica):
Utente cambia manualmente il sito in un ristorante

DOMANDA:
Utente: "Di cosa è questo sito?"
AI: (legge i file reali) "È un sito per ristorante con menu e prenotazioni"
     NON: "È un vape shop" (descrizione originale obsoleta)
```

## Logica da Implementare

### 1. Creazione Progetto
```
SE utente crea progetto con descrizione:
    AI genera codice IN BASE alla descrizione
    Salva descrizione in .drape/project.json (come riferimento)
```

### 2. Chat AI - Risposta a Domande
```
SE utente chiede "cosa fa il progetto?":
    1. Leggi i FILE REALI del progetto (App.jsx, components/, etc.)
    2. Analizza il codice per capire cosa fa
    3. Rispondi in base al codice ATTUALE

SE utente chiede di fare modifiche:
    1. Leggi i file esistenti
    2. Modifica in base alla richiesta
    3. L'AI è al servizio dell'utente, non della descrizione originale
```

## Regola Fondamentale

> La descrizione originale serve SOLO per la generazione iniziale.
> Dopo, l'AI deve sempre guardare lo stato REALE del progetto.
> L'utente è libero di cambiare tutto, l'AI si adatta.

## File Coinvolti

| File | Problema | Soluzione |
|------|----------|-----------|
| `backend/routes/workstation.js` | Crea template generico | Chiamare AI per generare in base a descrizione |
| `backend/routes/ai.js` | Non legge i file del progetto | Leggere file reali prima di rispondere |
| `frontend/src/services/ai-service.js` | Non passa contesto | Passare projectId per accesso ai file |

## Success Criteria

- [ ] Creazione: AI genera sito basato sulla descrizione, non template generico
- [ ] Chat: AI risponde guardando i file REALI del progetto
- [ ] Modifiche: Utente libero di cambiare, AI si adatta senza conflitti
- [ ] Nessuna incongruenza tra descrizione originale e stato attuale
