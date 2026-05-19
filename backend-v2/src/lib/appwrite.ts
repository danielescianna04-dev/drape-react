import { Client, Databases, Storage, Users, Teams } from 'node-appwrite';
import { env } from '../config/env';

/**
 * Appwrite server-side client con API key.
 * Bypassa permissions — usalo per provisioning, ne fa uso solo il backend Drape.
 */
const appwriteClient = new Client()
  .setEndpoint(env.APPWRITE_ENDPOINT)
  .setProject(env.APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);

export const appwriteDatabases = new Databases(appwriteClient);
export const appwriteStorage = new Storage(appwriteClient);
export const appwriteUsers = new Users(appwriteClient);
export const appwriteTeams = new Teams(appwriteClient);

export { appwriteClient };
