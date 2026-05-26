import type { AppwriteStarterTemplate } from './types';

export const todoStarter: AppwriteStarterTemplate = {
  id: 'todo',
  name: 'To-do list',
  description: 'Lista di task con priorità, scadenza e stato completato',
  tags: ['productivity', 'starter', 'crud'],
  collections: [
    {
      id: 'tasks',
      name: 'Tasks',
      attributes: [
        { key: 'title', type: 'string', required: true, size: 200 },
        { key: 'description', type: 'string', size: 2000 },
        { key: 'completed', type: 'boolean', default: false, required: true },
        {
          key: 'priority',
          type: 'enum',
          elements: ['low', 'medium', 'high'],
          default: 'medium',
        },
        { key: 'due_date', type: 'datetime' },
        { key: 'tags', type: 'string', array: true, size: 50 },
      ],
      indexes: [
        { key: 'idx_completed', type: 'key', attributes: ['completed'] },
        { key: 'idx_due_date', type: 'key', attributes: ['due_date'] },
      ],
    },
  ],
  sampleClientSnippet: `import { Client, Databases, ID, Query } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const db = new Databases(client);
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;

// Crea task
await db.createDocument(DB_ID, 'tasks', ID.unique(), {
  title: 'My first task',
  completed: false,
  priority: 'medium',
});

// Lista task non completati ordinati per priorità
const { documents } = await db.listDocuments(DB_ID, 'tasks', [
  Query.equal('completed', false),
  Query.orderDesc('priority'),
]);
`,
};
