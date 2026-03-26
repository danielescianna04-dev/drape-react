/**
 * Neon Postgres Management Service
 * Creates and manages Neon databases for Cloud Mode projects.
 * Replaces Supabase — cheaper, faster (2-5 sec vs 1-3 min), scale-to-zero.
 *
 * Pricing: 500 projects free, then $19/mo (Launch) or $69/mo (Scale).
 * Each project gets an isolated PostgreSQL database with its own connection string.
 */
import axios from 'axios';
import { log } from '../utils/logger';
import { config } from '../config';
import crypto from 'crypto';

const NEON_API = 'https://console.neon.tech/api/v2';

interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  created_at: string;
}

interface NeonConnectionUri {
  connection_uri: string;
  connection_parameters: {
    database: string;
    host: string;
    password: string;
    role: string;
  };
}

interface NeonEndpoint {
  id: string;
  host: string;
  type: string;
}

interface NeonDatabase {
  id: number;
  name: string;
  owner_name: string;
}

export interface NeonCredentials {
  projectId: string;
  host: string;
  database: string;
  role: string;
  password: string;
  connectionUri: string;          // postgresql://user:pass@host/db?sslmode=require
  connectionUriPooled: string;    // pooled connection for serverless (lower latency)
  endpointId: string;             // for running SQL via Neon API
}

class NeonManagementService {
  private apiKey: string;
  private region: string;
  private orgId: string;

  constructor() {
    this.apiKey = config.neonApiKey || '';
    this.region = config.neonRegion || 'aws-eu-central-1'; // Frankfurt (EU/GDPR)
    this.orgId = config.neonOrgId || '';
  }

  get isConfigured(): boolean {
    return !!(this.apiKey && this.orgId);
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Create a new Neon project with a database for a user's app.
   * Takes 2-5 seconds (vs 1-3 minutes for Supabase).
   */
  async createProject(
    projectName: string,
    userId: string,
    onProgress?: (pct: number, msg: string) => void
  ): Promise<NeonCredentials> {
    if (!this.isConfigured) {
      throw new Error('Neon API not configured. Set NEON_API_KEY env var.');
    }

    // Sanitize project name
    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 40);

    const dbName = 'drapedb';
    const roleName = `drape_${crypto.randomBytes(4).toString('hex')}`;

    log.info(`[Neon] Creating project "${safeName}" for user ${userId}...`);
    onProgress?.(10, 'Creating database...');

    try {
      // Step 1: Create project (this also creates the default branch, endpoint, database, and role)
      const createRes = await axios.post(`${NEON_API}/projects`, {
        project: {
          name: `drape-${safeName}`,
          region_id: this.region,
          org_id: this.orgId,
          pg_version: 17,
        },
      }, {
        headers: this.headers,
        timeout: 30000,
      });

      const { project, connection_uris, databases, roles, endpoints } = createRes.data;

      onProgress?.(30, 'Database created, configuring...');

      const projectId = project.id;
      const connUri = connection_uris?.[0];

      if (!connUri) {
        throw new Error('No connection URI returned from Neon API');
      }

      // Extract connection details
      const connectionUri = connUri.connection_uri;
      const params = connUri.connection_parameters;

      // Build pooled connection URI using pooler_host from API response
      const pooledHost = params.pooler_host || params.host.replace('.neon.tech', '-pooler.neon.tech');
      const connectionUriPooled = connectionUri.replace(params.host, pooledHost);

      // Extract endpoint ID for SQL execution
      const endpointId = endpoints?.[0]?.id || '';

      const credentials: NeonCredentials = {
        projectId,
        host: params.host,
        database: params.database,
        role: params.role,
        password: params.password,
        connectionUri,
        connectionUriPooled,
        endpointId,
      };

      onProgress?.(40, 'Database ready!');
      log.info(`[Neon] Project created: ${projectId} — host: ${credentials.host}`);

      return credentials;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.response?.data?.error || err.message;
      log.error(`[Neon] Failed to create project: ${msg}`);
      throw new Error(`Neon project creation failed: ${msg}`);
    }
  }

  /**
   * Run SQL on a Neon database (for creating tables, seeding data).
   * Connects directly via the Neon SQL API (no need for pg client).
   */
  async runSQL(projectId: string, sql: string, endpointId?: string, roleName: string = 'neondb_owner'): Promise<any> {
    try {
      const res = await axios.post(
        `${NEON_API}/projects/${projectId}/query`,
        {
          query: sql,
          db_name: 'neondb',
          endpoint_id: endpointId || undefined,
          role_name: roleName,
        },
        { headers: this.headers, timeout: 60000 }
      );
      log.info(`[Neon] SQL executed successfully on project ${projectId}`);
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      log.warn(`[Neon] SQL execution failed: ${msg}`);
      throw new Error(`Neon SQL failed: ${msg}`);
    }
  }

  /**
   * Delete a Neon project (cleanup when user deletes project in Drape).
   */
  async deleteProject(projectId: string): Promise<void> {
    try {
      await axios.delete(`${NEON_API}/projects/${projectId}`, {
        headers: this.headers,
        timeout: 15000,
      });
      log.info(`[Neon] Project ${projectId} deleted`);
    } catch (err: any) {
      log.warn(`[Neon] Failed to delete project ${projectId}: ${err.message}`);
    }
  }

  /**
   * Get project details (for checking status, getting connection info).
   */
  async getProject(projectId: string): Promise<NeonProject | null> {
    try {
      const res = await axios.get(`${NEON_API}/projects/${projectId}`, {
        headers: this.headers,
        timeout: 10000,
      });
      return res.data.project;
    } catch (err: any) {
      log.warn(`[Neon] Failed to get project ${projectId}: ${err.message}`);
      return null;
    }
  }

  /**
   * List all Neon projects (for admin/monitoring).
   */
  async listProjects(): Promise<NeonProject[]> {
    try {
      const res = await axios.get(`${NEON_API}/projects`, {
        headers: this.headers,
        timeout: 10000,
      });
      return res.data.projects || [];
    } catch (err: any) {
      log.warn(`[Neon] Failed to list projects: ${err.message}`);
      return [];
    }
  }
}

export const neonManagementService = new NeonManagementService();
