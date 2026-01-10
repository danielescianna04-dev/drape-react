# BUG: JSON Parsing Fallisce per Markdown Wrapper

## Problema

Gemini genera correttamente il codice del progetto, ma la risposta è wrappata in markdown code blocks e il parser fallisce.

## Log Evidence

```
📦 Gemini response received (54482 chars), parsing files...
📝 Response preview: ```json
{
  "package.json": "{\n  \"name\": \"lassissimo-ecommerce\"...
⚠️ JSON error, retrying...
❌ AI Error details: Could not parse JSON after retries
⚠️ FALLBACK TEMPLATE - description was ignored!
```

## Causa

Gemini restituisce:
```
```json
{
  "package.json": "...",
  "src/App.jsx": "..."
}
```
```

Ma il parser si aspetta JSON puro:
```
{
  "package.json": "...",
  "src/App.jsx": "..."
}
```

## Fix Necessario

Nel file `backend/routes/workstation.js`, dove viene parsato il JSON di Gemini:

1. **Prima di `JSON.parse()`**, rimuovi i markdown code blocks:

```javascript
// Rimuovi markdown code blocks se presenti
let cleanResponse = response;
if (cleanResponse.startsWith('```json')) {
    cleanResponse = cleanResponse.slice(7); // Rimuovi ```json
}
if (cleanResponse.startsWith('```')) {
    cleanResponse = cleanResponse.slice(3); // Rimuovi ```
}
if (cleanResponse.endsWith('```')) {
    cleanResponse = cleanResponse.slice(0, -3); // Rimuovi ``` finale
}
cleanResponse = cleanResponse.trim();

// Ora parsa il JSON pulito
const files = JSON.parse(cleanResponse);
```

2. **Oppure usa regex** per estrarre il JSON:

```javascript
// Estrai JSON da markdown code block
const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
const jsonString = jsonMatch ? jsonMatch[1].trim() : response.trim();
const files = JSON.parse(jsonString);
```

## File da Modificare

| File | Funzione | Cosa Fare |
|------|----------|-----------|
| `backend/routes/workstation.js` | Dove parsa risposta Gemini | Pulire markdown prima di JSON.parse |

## Success Criteria

- [ ] Risposta Gemini con ` ```json ``` ` viene parsata correttamente
- [ ] Progetto "sito borse lusso" viene creato con contenuto corretto, non template generico
- [ ] No più errore "Could not parse JSON after retries"
