/**
 * Supabase Management API Service
 * Creates and manages Supabase projects automatically for Cloud Mode.
 * Like Lovable — user clicks Cloud Mode, gets a full Supabase backend instantly.
 */
import axios from 'axios';
import { log } from '../utils/logger';
import { config } from '../config';
import crypto from 'crypto';

const SUPABASE_API = 'https://api.supabase.com';

interface SupabaseProject {
  id: string;           // project ref (e.g., "abcdefghijkl")
  name: string;
  organization_id: string;
  region: string;
  status: string;       // "ACTIVE_HEALTHY" when ready
}

interface SupabaseApiKey {
  name: string;         // "anon" or "service_role"
  api_key: string;
}

export interface SupabaseCredentials {
  projectRef: string;
  url: string;          // https://{ref}.supabase.co
  anonKey: string;
  serviceRoleKey: string;
  dbPassword: string;
}

class SupabaseManagementService {
  private accessToken: string;
  private organizationId: string;
  private region: string;

  constructor() {
    this.accessToken = config.supabaseAccessToken || '';
    this.organizationId = config.supabaseOrgId || '';
    this.region = config.supabaseRegion || 'eu-central-1'; // Frankfurt by default (EU/GDPR)
  }

  get isConfigured(): boolean {
    return !!(this.accessToken && this.organizationId);
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a new Supabase project for a user's app.
   * Returns credentials once the project is ready.
   */
  async createProject(projectName: string, userId: string, onProgress?: (pct: number, msg: string) => void): Promise<SupabaseCredentials> {
    if (!this.isConfigured) {
      throw new Error('Supabase Management API not configured. Set SUPABASE_ACCESS_TOKEN and SUPABASE_ORG_ID.');
    }

    // Generate a secure random password for the database
    const dbPassword = crypto.randomBytes(16).toString('hex');

    // Sanitize project name for Supabase (alphanumeric + hyphens, max 40 chars)
    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 40);

    log.info(`[Supabase] Creating project "${safeName}" for user ${userId}...`);

    try {
      // Step 1: Create the project
      const createRes = await axios.post(`${SUPABASE_API}/v1/projects`, {
        name: safeName,
        organization_id: this.organizationId,
        region: this.region,
        plan: 'free',
        db_pass: dbPassword,
      }, { headers: this.headers, timeout: 30000 });

      const project: SupabaseProject = createRes.data;
      const projectRef = project.id;
      log.info(`[Supabase] Project created: ${projectRef} (status: ${project.status})`);

      // Step 2: Wait for project to be ready (can take 30-120 seconds)
      await this.waitForProjectReady(projectRef, 180000, onProgress);

      // Step 3: Get API keys
      const keys = await this.getApiKeys(projectRef);
      const anonKey = keys.find(k => k.name === 'anon')?.api_key || '';
      const serviceRoleKey = keys.find(k => k.name === 'service_role')?.api_key || '';

      if (!anonKey || !serviceRoleKey) {
        throw new Error(`Failed to retrieve API keys for project ${projectRef}`);
      }

      const credentials: SupabaseCredentials = {
        projectRef,
        url: `https://${projectRef}.supabase.co`,
        anonKey,
        serviceRoleKey,
        dbPassword,
      };

      log.info(`[Supabase] Project ${projectRef} ready — URL: ${credentials.url}`);
      return credentials;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      log.error(`[Supabase] Failed to create project: ${msg}`);
      throw new Error(`Supabase project creation failed: ${msg}`);
    }
  }

  /**
   * Wait for a project to become ACTIVE_HEALTHY (polls every 5 seconds)
   */
  async waitForProjectReady(projectRef: string, maxWaitMs = 180000, onProgress?: (pct: number, msg: string) => void): Promise<void> {
    const start = Date.now();
    const pollInterval = 5000;
    let pollCount = 0;

    while (Date.now() - start < maxWaitMs) {
      pollCount++;
      try {
        const res = await axios.get(`${SUPABASE_API}/v1/projects/${projectRef}`, {
          headers: this.headers,
          timeout: 10000,
        });

        const status = res.data.status;
        log.info(`[Supabase] Project ${projectRef} status: ${status}`);

        // Report incremental progress during polling (30-48%)
        if (onProgress) {
          const elapsed = Date.now() - start;
          const pct = Math.min(38, 18 + Math.floor((elapsed / maxWaitMs) * 20));
          const messages = [
            'Creating Supabase database...',
            'Provisioning PostgreSQL...',
            'Setting up authentication...',
            'Configuring API gateway...',
            'Initializing storage...',
            'Almost ready...',
          ];
          onProgress(pct, messages[Math.min(pollCount - 1, messages.length - 1)]);
        }

        if (status === 'ACTIVE_HEALTHY') {
          return;
        }
      } catch (err: any) {
        log.warn(`[Supabase] Polling error: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, pollInterval));
    }

    throw new Error(`Supabase project ${projectRef} did not become ready within ${maxWaitMs / 1000}s`);
  }

  /**
   * Get API keys for a project
   */
  private async getApiKeys(projectRef: string): Promise<SupabaseApiKey[]> {
    const res = await axios.get(`${SUPABASE_API}/v1/projects/${projectRef}/api-keys`, {
      headers: this.headers,
      timeout: 10000,
    });
    return res.data;
  }

  /**
   * Run SQL on a Supabase project (for creating tables, seeding data)
   */
  async runSQL(projectRef: string, sql: string): Promise<any> {
    try {
      const res = await axios.post(
        `${SUPABASE_API}/v1/projects/${projectRef}/database/query`,
        { query: sql },
        { headers: this.headers, timeout: 30000 }
      );
      return res.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      log.warn(`[Supabase] SQL execution failed: ${msg}`);
      throw new Error(`Supabase SQL failed: ${msg}`);
    }
  }

  /**
   * Delete a Supabase project (cleanup)
   */
  async deleteProject(projectRef: string): Promise<void> {
    try {
      await axios.delete(`${SUPABASE_API}/v1/projects/${projectRef}`, {
        headers: this.headers,
        timeout: 15000,
      });
      log.info(`[Supabase] Project ${projectRef} deleted`);
    } catch (err: any) {
      log.warn(`[Supabase] Failed to delete project ${projectRef}: ${err.message}`);
    }
  }
}

export const supabaseManagementService = new SupabaseManagementService();
