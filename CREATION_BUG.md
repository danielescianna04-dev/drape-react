# BUG: Progetto Non Generato in Base alla Descrizione

## Problema

Quando l'utente crea un nuovo progetto con una descrizione specifica, il sistema crea un template generico invece di generare il sito in base alla descrizione.

## Esempio

### Richiesta Utente
```
"Fammi un sito di vendita di zaini sportivi"
```

### Risultato Attuale (SBAGLIATO)
- Viene creato il template generico "React App" con contatore
- Nessun prodotto, nessun carrello, nessuno zaino

### Risultato Atteso (CORRETTO)
- Sito e-commerce per zaini sportivi
- Prodotti realistici (zaini Nike, Adidas, The North Face, etc.)
- Categorie, prezzi, design appropriato

## Causa

Il file `backend/routes/workstation.js` nella funzione di creazione progetto:
1. Salva la descrizione in `.drape/project.json` ✅
2. MA usa un template generico invece di chiamare l'AI per generare ❌

## Cosa Fixare

### Nel file `backend/routes/workstation.js`

Trova dove viene creato il progetto (endpoint `/workstation/create-with-template` o simile).

Invece di usare un template statico, deve:

1. Prendere la descrizione dell'utente
2. Chiamare l'AI (Gemini) con un prompt tipo:
```
Genera un sito React + Vite completo per: "{descrizione utente}"

Requisiti:
- Contenuto REALISTICO (nomi prodotti veri, prezzi reali)
- Design appropriato per il tipo di sito
- Struttura: index.html, package.json, vite.config.js, src/

Per zaini sportivi:
- Prodotti: "Nike Brasilia", "Adidas Classic", "The North Face Borealis"
- Categorie: "Running", "Trekking", "Scuola", "Viaggio"
- Prezzi: €49.99, €79.99, €129.99
```
3. L'AI genera tutti i file
4. Salvare i file generati dall'AI

## Flow Corretto

```
Utente: "Sito vendita zaini sportivi"
          │
          ▼
    Salva descrizione in .drape/project.json
          │
          ▼
    Chiama AI: "Genera sito per zaini sportivi"
          │
          ▼
    AI genera: App.jsx con prodotti zaini,
               componenti ProductCard, Cart, etc.
               stili appropriati
          │
          ▼
    Salva tutti i file generati dall'AI
          │
          ▼
    Utente vede sito zaini sportivi (NON template generico)
```

## File da Modificare

| File | Cosa Fare |
|------|-----------|
| `backend/routes/workstation.js` | Chiamare AI per generare invece di usare template |
| `backend/services/ai-providers.js` | Assicurarsi che Gemini sia disponibile per generazione |

## Success Criteria

- [ ] Creo progetto con "sito zaini sportivi" → vedo sito con zaini, non contatore
- [ ] Creo progetto con "ristorante italiano" → vedo menu con piatti, non contatore
- [ ] Creo progetto con "portfolio fotografo" → vedo galleria foto, non contatore
- [ ] Il template generico NON viene mai usato quando c'è una descrizione

## Nota Importante

NON rimuovere il template generico completamente - serve come fallback se:
- L'utente non inserisce descrizione
- L'AI fallisce per qualche motivo

Ma SE c'è una descrizione, DEVE essere usata l'AI per generare.
