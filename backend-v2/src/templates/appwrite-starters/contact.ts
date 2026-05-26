import type { AppwriteStarterTemplate } from './types';

export const contactStarter: AppwriteStarterTemplate = {
  id: 'contact',
  name: 'Sito vetrina con form contatti',
  description: 'Landing page + form contatti (Appwrite per submission, Resend per email)',
  tags: ['landing', 'marketing', 'form'],
  collections: [
    {
      id: 'submissions',
      name: 'Submissions',
      attributes: [
        { key: 'name', type: 'string', required: true, size: 200 },
        { key: 'email', type: 'email', required: true },
        { key: 'subject', type: 'string', size: 200 },
        { key: 'message', type: 'string', required: true, size: 5000 },
        { key: 'phone', type: 'string', size: 50 },
        { key: 'source_page', type: 'string', size: 200 },
        { key: 'handled', type: 'boolean', default: false, required: true },
      ],
      indexes: [
        { key: 'idx_handled', type: 'key', attributes: ['handled'] },
        { key: 'idx_email', type: 'key', attributes: ['email'] },
      ],
    },
  ],
  sampleClientSnippet: `import { Client, Databases, ID } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const db = new Databases(client);
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;

// Submit form contatti
async function submitContact(form) {
  await db.createDocument(DB_ID, 'submissions', ID.unique(), {
    name: form.name,
    email: form.email,
    message: form.message,
    source_page: window.location.pathname,
    handled: false,
  });
  // (opzionale) chiama API esterna tipo Resend per notifica email all'admin
}
`,
};
