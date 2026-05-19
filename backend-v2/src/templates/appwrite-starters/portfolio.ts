import type { AppwriteStarterTemplate } from './types';

export const portfolioStarter: AppwriteStarterTemplate = {
  id: 'portfolio',
  name: 'Portfolio personale',
  description: 'Galleria progetti, bio, skills — per fotografi/designer/dev',
  tags: ['portfolio', 'personal', 'gallery'],
  collections: [
    {
      id: 'projects',
      name: 'Projects',
      attributes: [
        { key: 'title', type: 'string', required: true, size: 200 },
        { key: 'slug', type: 'string', required: true, size: 200 },
        { key: 'description', type: 'string', size: 5000 },
        { key: 'cover_url', type: 'url', required: true },
        { key: 'gallery_urls', type: 'url', array: true },
        { key: 'client', type: 'string', size: 200 },
        { key: 'year', type: 'integer' },
        { key: 'tags', type: 'string', array: true, size: 50 },
        { key: 'link_url', type: 'url' },
        { key: 'featured', type: 'boolean', default: false, required: true },
      ],
      indexes: [
        { key: 'idx_slug', type: 'unique', attributes: ['slug'] },
        { key: 'idx_featured', type: 'key', attributes: ['featured'] },
      ],
    },
  ],
  sampleClientSnippet: `import { Client, Databases, Query } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const db = new Databases(client);
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;

// Featured projects in homepage
const { documents: featured } = await db.listDocuments(DB_ID, 'projects', [
  Query.equal('featured', true),
  Query.orderDesc('year'),
]);

// Dettaglio progetto per slug
const { documents } = await db.listDocuments(DB_ID, 'projects', [
  Query.equal('slug', slugFromUrl),
  Query.limit(1),
]);
`,
};
