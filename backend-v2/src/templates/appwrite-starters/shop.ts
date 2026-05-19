import type { AppwriteStarterTemplate } from './types';

export const shopStarter: AppwriteStarterTemplate = {
  id: 'shop',
  name: 'E-commerce semplice',
  description: 'Catalogo prodotti con carrello e ordini (Stripe Checkout esterno)',
  tags: ['ecommerce', 'shop', 'products'],
  collections: [
    {
      id: 'products',
      name: 'Products',
      attributes: [
        { key: 'name', type: 'string', required: true, size: 200 },
        { key: 'slug', type: 'string', required: true, size: 200 },
        { key: 'description', type: 'string', size: 5000 },
        { key: 'price_cents', type: 'integer', required: true },
        { key: 'currency', type: 'string', size: 3, default: 'EUR' },
        { key: 'image_urls', type: 'url', array: true },
        { key: 'stock', type: 'integer', default: 0 },
        { key: 'category', type: 'string', size: 100 },
        { key: 'active', type: 'boolean', default: true, required: true },
      ],
      indexes: [
        { key: 'idx_slug', type: 'unique', attributes: ['slug'] },
        { key: 'idx_category_active', type: 'key', attributes: ['category', 'active'] },
      ],
    },
    {
      id: 'orders',
      name: 'Orders',
      attributes: [
        { key: 'customer_email', type: 'email', required: true },
        { key: 'customer_name', type: 'string', size: 200 },
        { key: 'items', type: 'string', required: true, size: 65535 }, // JSON array stringified
        { key: 'subtotal_cents', type: 'integer', required: true },
        { key: 'total_cents', type: 'integer', required: true },
        { key: 'currency', type: 'string', size: 3, default: 'EUR' },
        {
          key: 'status',
          type: 'enum',
          elements: ['pending', 'paid', 'shipped', 'delivered', 'refunded', 'cancelled'],
          default: 'pending',
        },
        { key: 'stripe_session_id', type: 'string', size: 200 },
      ],
      indexes: [
        { key: 'idx_status', type: 'key', attributes: ['status'] },
        { key: 'idx_customer', type: 'key', attributes: ['customer_email'] },
      ],
    },
  ],
  sampleClientSnippet: `import { Client, Databases, Query, ID } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const db = new Databases(client);
const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;

// Lista prodotti attivi per categoria
const { documents: products } = await db.listDocuments(DB_ID, 'products', [
  Query.equal('active', true),
  Query.equal('category', 'shoes'),
  Query.orderAsc('name'),
]);

// Crea ordine (dopo checkout Stripe)
await db.createDocument(DB_ID, 'orders', ID.unique(), {
  customer_email: 'cliente@example.com',
  items: JSON.stringify(cartItems),
  subtotal_cents: 9990,
  total_cents: 9990,
  status: 'pending',
  stripe_session_id: 'cs_test_xxx',
});
`,
};
