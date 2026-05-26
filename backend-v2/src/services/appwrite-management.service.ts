import { ID, Permission, Role } from 'node-appwrite';
import { appwriteDatabases } from '../lib/appwrite';
import { supabaseAdmin } from '../lib/supabase';

/**
 * Appwrite Management service.
 *
 * Architettura provisioning:
 * - 1 progetto Appwrite (`bynot-platform`, gestito da Bynot)
 * - Per ogni utente Bynot: 1 database Appwrite con ID `bynot-user-{supabase_user_id}`
 * - Dentro al database: collections create on-demand (todo, blog, shop, ecc.)
 *
 * Le credenziali Appwrite (endpoint + project_id) sono pubbliche e vengono
 * iniettate nel codice generato dall'AI. Il database_id è l'unico secret.
 */

type AppwriteAttributeType = 'string' | 'integer' | 'boolean' | 'datetime' | 'email' | 'url' | 'enum';

interface AppwriteAttribute {
  key: string;
  type: AppwriteAttributeType;
  required?: boolean;
  default?: any;
  array?: boolean;
  size?: number;            // per string
  elements?: string[];      // per enum
}

interface AppwriteCollectionSchema {
  id: string;
  name: string;
  attributes: AppwriteAttribute[];
  indexes?: { key: string; type: 'key' | 'fulltext' | 'unique'; attributes: string[] }[];
  documentSecurity?: boolean;
}

export interface ProvisionResult {
  databaseId: string;
  endpoint: string;
  projectId: string;
}

const DB_ID_PREFIX = 'bynot-user-';

function userDatabaseId(userId: string): string {
  return `${DB_ID_PREFIX}${userId.replace(/-/g, '')}`.slice(0, 36); // Appwrite ID max 36 char
}

export class AppwriteManagementService {
  /**
   * Provisiona (o riusa se già esiste) il database Appwrite per un utente Bynot.
   * Salva il database_id sul Supabase project record per lookup futuro.
   */
  async provisionUserDatabase(userId: string, supabaseProjectId: string): Promise<ProvisionResult> {
    const dbId = userDatabaseId(userId);

    // Idempotent: tenta create, se exists prosegui
    try {
      await appwriteDatabases.create(dbId, `Bynot user ${userId.slice(0, 8)}`);
    } catch (err: any) {
      if (err?.code !== 409) throw err;
      // 409 = already exists, ok
    }

    // Aggiorna Supabase projects row con i riferimenti Appwrite
    const { error } = await supabaseAdmin
      .from('projects')
      .update({
        appwrite_database_id: dbId,
        appwrite_endpoint: process.env.APPWRITE_ENDPOINT,
        appwrite_project_id: process.env.APPWRITE_PROJECT_ID,
      })
      .eq('id', supabaseProjectId);
    if (error) throw new Error(`Failed to update Supabase project: ${error.message}`);

    return {
      databaseId: dbId,
      endpoint: process.env.APPWRITE_ENDPOINT!,
      projectId: process.env.APPWRITE_PROJECT_ID!,
    };
  }

  /**
   * Crea una collection in un database utente con schema dichiarativo.
   * Usata dall'AI quando genera codice che ha bisogno di una tabella nuova.
   */
  async createCollection(databaseId: string, schema: AppwriteCollectionSchema): Promise<void> {
    // Permissions: per ora documenti accessibili a chi conosce databaseId.
    // TODO v2.1: usare Appwrite Users + permission per user_id.
    const permissions = [
      Permission.read(Role.any()),
      Permission.write(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ];

    await appwriteDatabases.createCollection(
      databaseId,
      schema.id,
      schema.name,
      permissions,
      schema.documentSecurity ?? false,
    );

    for (const attr of schema.attributes) {
      await this.createAttribute(databaseId, schema.id, attr);
    }

    if (schema.indexes) {
      for (const idx of schema.indexes) {
        await appwriteDatabases.createIndex(
          databaseId,
          schema.id,
          idx.key,
          idx.type as any,
          idx.attributes,
        );
      }
    }
  }

  private async createAttribute(
    databaseId: string,
    collectionId: string,
    attr: AppwriteAttribute,
  ): Promise<void> {
    const { key, type, required = false, default: def, array = false, size = 256, elements } = attr;
    switch (type) {
      case 'string':
        await appwriteDatabases.createStringAttribute(
          databaseId,
          collectionId,
          key,
          size,
          required,
          def,
          array,
        );
        return;
      case 'integer':
        await appwriteDatabases.createIntegerAttribute(
          databaseId,
          collectionId,
          key,
          required,
          undefined,
          undefined,
          def,
          array,
        );
        return;
      case 'boolean':
        await appwriteDatabases.createBooleanAttribute(
          databaseId,
          collectionId,
          key,
          required,
          def,
          array,
        );
        return;
      case 'datetime':
        await appwriteDatabases.createDatetimeAttribute(
          databaseId,
          collectionId,
          key,
          required,
          def,
          array,
        );
        return;
      case 'email':
        await appwriteDatabases.createEmailAttribute(
          databaseId,
          collectionId,
          key,
          required,
          def,
          array,
        );
        return;
      case 'url':
        await appwriteDatabases.createUrlAttribute(
          databaseId,
          collectionId,
          key,
          required,
          def,
          array,
        );
        return;
      case 'enum':
        if (!elements) throw new Error(`enum attribute ${key} needs elements`);
        await appwriteDatabases.createEnumAttribute(
          databaseId,
          collectionId,
          key,
          elements,
          required,
          def,
          array,
        );
        return;
    }
  }

  /**
   * Cancella il database Appwrite di un utente (per delete progetto Bynot).
   */
  async deleteUserDatabase(databaseId: string): Promise<void> {
    try {
      await appwriteDatabases.delete(databaseId);
    } catch (err: any) {
      if (err?.code === 404) return; // già cancellato
      throw err;
    }
  }

  /**
   * Lista collection in un database utente — utile per UI debug.
   */
  async listCollections(databaseId: string) {
    return appwriteDatabases.listCollections(databaseId);
  }

  /**
   * Health check: verifica che il backend possa comunicare con Appwrite.
   */
  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await appwriteDatabases.list();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  }
}

export const appwriteManagementService = new AppwriteManagementService();
