import type { AppwriteStarterTemplate } from './types';

export const blogStarter: AppwriteStarterTemplate = {
  id: 'blog',
  name: 'Blog / CMS',
  description: 'Blog con post markdown, autori, tag, commenti',
  tags: ['content', 'cms', 'blog'],
  collections: [
    {
      id: 'posts',
      name: 'Posts',
      attributes: [
        { key: 'title', type: 'string', required: true, size: 200 },
        { key: 'slug', type: 'string', required: true, size: 200 },
        { key: 'content_md', type: 'string', required: true, size: 65535 },
        { key: 'excerpt', type: 'string', size: 500 },
        { key: 'cover_url', type: 'url' },
        { key: 'author_name', type: 'string', size: 100 },
        { key: 'status', type: 'enum', elements: ['draft', 'published'], default: 'draft' },
        { key: 'tags', type: 'string', array: true, size: 50 },
        { key: 'published_at', type: 'datetime' },
      ],
      indexes: [
        { key: 'idx_slug', type: 'unique', attributes: ['slug'] },
        { key: 'idx_status_published', type: 'key', attributes: ['status', 'published_at'] },
      ],
    },
    {
      id: 'comments',
      name: 'Comments',
      attributes: [
        { key: 'post_id', type: 'string', required: true, size: 36 },
        { key: 'author_name', type: 'string', required: true, size: 100 },
        { key: 'author_email', type: 'email' },
        { key: 'body', type: 'string', required: true, size: 5000 },
        { key: 'approved', type: 'boolean', default: false, required: true },
      ],
      indexes: [{ key: 'idx_post', type: 'key', attributes: ['post_id'] }],
    },
  ],
  sampleClientSnippet: `import { Client, Databases, Query } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const db = new Databases(client);
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;

// Lista post pubblicati più recenti
const { documents: posts } = await db.listDocuments(DB_ID, 'posts', [
  Query.equal('status', 'published'),
  Query.orderDesc('published_at'),
  Query.limit(10),
]);

// Carica singolo post per slug
const { documents } = await db.listDocuments(DB_ID, 'posts', [
  Query.equal('slug', slugFromUrl),
  Query.limit(1),
]);
`,
};
