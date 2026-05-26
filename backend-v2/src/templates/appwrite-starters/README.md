# Appwrite Starter Templates

Schema dichiarativi per le app più comuni che gli utenti Bynot generano.
L'AI può referenziarli, l'utente può sceglierli da menu, e il backend
li passa a `appwriteManagementService.createCollection()`.

Ogni file esporta una `AppwriteStarterTemplate` con:
- `id`: ID univoco (es. "todo", "blog")
- `name`: nome leggibile
- `description`: 1 riga, descrizione per UI e AI
- `collections`: array di schema collection da creare
- `seedDocuments` (opzionale): documenti iniziali per il primo run

Per usarli nel codice generato dall'AI, l'AI ottiene credenziali (endpoint + projectId + databaseId)
e chiama l'SDK Appwrite client (`appwrite` npm package) direttamente dal browser/Sandpack.
