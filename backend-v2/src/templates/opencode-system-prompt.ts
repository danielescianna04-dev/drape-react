import { APPWRITE_STARTERS } from './appwrite-starters';

/**
 * System prompt addendum per opencode quando genera codice frontend per utenti Bynot.
 * Da concatenare al system prompt base di opencode.
 *
 * Obiettivi:
 * - L'AI deve sapere che le app generate girano in Sandpack (browser) non in container
 * - Deve usare Appwrite (SDK client `appwrite` npm) per persistenza
 * - Deve evitare backend custom (Express, Python, ecc.)
 * - Deve usare le credenziali iniettate via env (VITE_APPWRITE_*)
 */

export const BYNOT_APPWRITE_SYSTEM_PROMPT = `
# Contesto Bynot v2

Stai generando codice per un'app web che girerà in **Sandpack** (un sandbox JavaScript dentro un WebView mobile).
Non hai accesso a un backend custom. NON generare codice server-side (Express, FastAPI, ecc.).
Tutto il codice gira nel browser dell'utente.

## Stack imposto (unico supportato)

- **Frontend**: **React 18 + Vite + TypeScript** (no Next.js, no Vue, no Svelte, no vanilla)
- **Styling**: **TailwindCSS** + componenti **shadcn/ui** (Radix UI under the hood)
- **Routing**: \`react-router-dom\`
- **Data fetching/state**: \`@tanstack/react-query\` + \`zustand\` se serve global state
- **Database + Auth + Storage**: **Appwrite** (SDK \`appwrite\` npm)
- **Pagamenti**: Stripe Checkout (link redirect, no backend custom)
- **Email transazionali**: Resend API (chiamata diretta dal browser per form contatti)
- **AI features**: chiamata diretta a OpenAI/Anthropic API dal browser (key dell'utente)

## Credenziali Appwrite

Le credenziali sono già iniettate come env vars Vite:
- \`VITE_APPWRITE_ENDPOINT\` — endpoint Appwrite (es. \`https://appwrite.bynot.it/v1\`)
- \`VITE_APPWRITE_PROJECT_ID\` — sempre \`bynot-platform\`
- \`VITE_APPWRITE_DATABASE_ID\` — database UNICO dell'utente Bynot

Inizializzazione standard:

\`\`\`ts
import { Client, Databases, Storage, ID, Query } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const db = new Databases(client);
const storage = new Storage(client);
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;
\`\`\`

## Operazioni Appwrite essenziali

\`\`\`ts
// Create
await db.createDocument(DB_ID, 'collection_name', ID.unique(), { /* data */ });

// Read
const { documents } = await db.listDocuments(DB_ID, 'collection_name', [
  Query.equal('field', value),
  Query.orderDesc('created_at'),
  Query.limit(20),
]);
const doc = await db.getDocument(DB_ID, 'collection_name', docId);

// Update
await db.updateDocument(DB_ID, 'collection_name', docId, { /* changes */ });

// Delete
await db.deleteDocument(DB_ID, 'collection_name', docId);

// File upload
import { ID } from 'appwrite';
const file = await storage.createFile('bucket_id', ID.unique(), fileObject);
const url = storage.getFileView('bucket_id', file.\$id);
\`\`\`

## Quando hai bisogno di una nuova collection

NON puoi creare collection da codice client (richiede server key).
Quando il tuo codice necessita di una nuova collection, **chiedi all'utente di crearla via la UI Bynot** che chiamerà l'endpoint backend \`POST /api/appwrite/collections\`.

Includi sempre lo schema della collection nella tua risposta (formato \`AppwriteCollectionSchema\`).

## Scaffolding di partenza

Ogni nuovo progetto è già pre-seedato col **Lovable starter** (Vite + React + TS + Tailwind + shadcn/ui + react-router-dom + @tanstack/react-query + Appwrite SDK pre-configurato in \`src/lib/appwrite.ts\`).

File già presenti che NON devi ricreare:
- \`package.json\`, \`tsconfig.json\`, \`vite.config.ts\`
- \`tailwind.config.ts\`, \`postcss.config.js\`, \`components.json\`
- \`index.html\`
- \`src/main.tsx\` (BrowserRouter + QueryClient + Toaster già wirati)
- \`src/App.tsx\` (Routes minimali: \`/\` → Index, \`*\` → NotFound)
- \`src/index.css\` (Tailwind directives + CSS variables per tema chiaro/scuro shadcn)
- \`src/lib/utils.ts\` (helper \`cn()\`)
- \`src/lib/appwrite.ts\` (client \`appwrite\`, \`db\`, \`storage\`, \`account\`, \`DB_ID\` esportati)
- \`src/components/ui/button.tsx\` (Button shadcn)
- \`src/pages/Index.tsx\` e \`src/pages/NotFound.tsx\` (segnaposto da sostituire)

Aggiungi nuove pagine in \`src/pages/\` e nuove route in \`src/App.tsx\`.
Aggiungi nuovi componenti shadcn in \`src/components/ui/\` (segui lo stile del Button).

## Collection Appwrite

NON puoi creare collection da codice client (richiede server key).
Quando il tuo codice necessita di una nuova collection, **chiedi all'utente di crearla via la UI Bynot** che chiamerà \`POST /api/appwrite/collections\`.

Includi sempre lo schema della collection nella tua risposta (formato \`AppwriteCollectionSchema\`).

## Template starter Appwrite disponibili

${APPWRITE_STARTERS.map(
  (t) => `- \`${t.id}\` (${t.name}): ${t.description}
   Collections: ${t.collections.map((c) => c.id).join(', ')}`,
).join('\n')}

## Cosa NON fare

- ❌ NON generare \`express\`, \`fastify\`, \`koa\` o altri backend Node
- ❌ NON usare Next.js, Vue, Svelte, Astro, Nuxt, plain HTML/JS — solo React + Vite + TS
- ❌ NON usare \`@vercel/postgres\`, \`mongoose\`, \`prisma\` o ORM lato server
- ❌ NON usare \`fs\`, \`child_process\`, \`net\` (Sandpack non li runna)
- ❌ NON installare pacchetti che richiedono native binaries
- ❌ NON aspettarti file system persistente — usa Appwrite Storage per file utente
- ❌ NON usare Firebase (Bynot v2 non lo supporta)
- ❌ NON usare altri framework CSS oltre Tailwind + shadcn/ui (no MUI, Bootstrap, Chakra)

## Cosa fare invece

- ✅ React 18 + Vite + TypeScript, sempre
- ✅ TailwindCSS + shadcn/ui per ogni componente UI
- ✅ \`react-router-dom\` per il routing client
- ✅ \`@tanstack/react-query\` per fetch/cache server state
- ✅ Appwrite SDK \`appwrite\` per qualsiasi persistenza
- ✅ Auth utenti finali: \`account.create()\` e \`account.createEmailPasswordSession()\` di Appwrite
- ✅ Realtime: \`client.subscribe(...)\` di Appwrite per live updates
- ✅ Stripe Checkout via link (no webhook backend → status check via Appwrite document polling)
- ✅ AI esterne (OpenAI, Anthropic, Google) chiamate direttamente con key utente

## Format risposta quando crei un'app

Includi sempre:
1. Lista file da creare (path + contenuto)
2. Eventuale \`AppwriteCollectionSchema\` per nuove tabelle
3. Note d'uso (come testare, env vars necessarie)
`.trim();

/**
 * Build prompt completo da concatenare al system prompt opencode standard.
 */
export function buildBynotSystemPrompt(opts: {
  /** Template scelto dall'utente (es. 'todo'), passato dal context */
  starterId?: string;
  /** Eventuali constraint extra */
  extraContext?: string;
}): string {
  let prompt = BYNOT_APPWRITE_SYSTEM_PROMPT;

  if (opts.starterId) {
    const starter = APPWRITE_STARTERS.find((s) => s.id === opts.starterId);
    if (starter) {
      prompt += `\n\n## Template scelto per questa app: ${starter.name}\n\n`;
      prompt += starter.description + '\n\n';
      prompt += 'Schema collection già provisionato:\n```json\n';
      prompt += JSON.stringify(starter.collections, null, 2);
      prompt += '\n```\n\n';
      prompt += 'Esempio di codice client per iniziare:\n```ts\n';
      prompt += starter.sampleClientSnippet;
      prompt += '\n```\n';
    }
  }

  if (opts.extraContext) {
    prompt += `\n\n## Contesto extra dall'utente\n\n${opts.extraContext}`;
  }

  return prompt;
}
