# BUG: Bad Escaped Characters in Gemini JSON Response

## Problema

Gemini genera JSON con caratteri di escape non validi, causando errore di parsing.

## Log Evidence

```
🧹 Stripped markdown code block wrapper  ← OK!
⚠️ JSON error: Bad escaped character in JSON at position 6246 (line 11 column 227)
❌ Could not parse JSON after retries
⚠️ FALLBACK TEMPLATE - description was ignored!
```

## Causa

Gemini genera codice con caratteri che rompono il JSON:
- Backslash singoli (`\n` dentro stringhe che dovrebbero essere `\\n`)
- Caratteri speciali non escaped (`"` dentro stringhe)
- Template literals con backticks

Esempio di JSON rotto:
```json
{
  "src/App.jsx": "const text = "Hello\nWorld";"  ← ROTTO
}
```

Dovrebbe essere:
```json
{
  "src/App.jsx": "const text = \"Hello\\nWorld\";"  ← CORRETTO
}
```

## Fix Necessario

Nel file `backend/routes/workstation.js`, PRIMA di JSON.parse, sanitizza il contenuto:

```javascript
function sanitizeJsonResponse(response) {
    // Fix common escape issues in JSON string values
    // This is tricky because we need to fix escapes INSIDE string values

    try {
        // Try parsing first
        return JSON.parse(response);
    } catch (e) {
        // If it fails, try to fix common issues
        let fixed = response;

        // Fix unescaped newlines inside strings (but not the \n that are JSON structure)
        // This regex finds string values and fixes escapes inside them
        fixed = fixed.replace(/"([^"]*?)(?<!\\)\n([^"]*?)"/g, '"$1\\n$2"');

        // Fix unescaped tabs
        fixed = fixed.replace(/"([^"]*?)(?<!\\)\t([^"]*?)"/g, '"$1\\t$2"');

        // Fix unescaped backslashes that aren't already escape sequences
        // Be careful: \n, \t, \r, \\, \" are valid, but single \ is not

        return JSON.parse(fixed);
    }
}
```

## Alternativa: Chiedi a Gemini di usare Base64

Nel prompt di sistema, chiedi a Gemini di:
1. Encodare il contenuto dei file in Base64
2. Restituire JSON con contenuti base64
3. Decodificare lato server

```json
{
  "package.json": "ewogICJuYW1lIjogInRlc3QiCn0=",
  "src/App.jsx": "aW1wb3J0IFJlYWN0IGZyb20gJ3JlYWN0Jzs="
}
```

## Soluzione Più Semplice: Cambia formato risposta

Invece di JSON con contenuti inline, chiedi file separati:

```
===FILE:package.json===
{
  "name": "test"
}
===END===
===FILE:src/App.jsx===
import React from 'react';
===END===
```

E parsa con regex invece di JSON.parse.

## Success Criteria

- [ ] Gemini response viene parsata correttamente
- [ ] Nessun "Bad escaped character" error
- [ ] Progetto creato con contenuto corretto, non template generico
