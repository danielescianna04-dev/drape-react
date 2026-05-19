import { todoStarter } from './todo';
import { blogStarter } from './blog';
import { shopStarter } from './shop';
import { contactStarter } from './contact';
import { portfolioStarter } from './portfolio';
import type { AppwriteStarterTemplate } from './types';

export * from './types';

export const APPWRITE_STARTERS: AppwriteStarterTemplate[] = [
  todoStarter,
  blogStarter,
  shopStarter,
  contactStarter,
  portfolioStarter,
];

export function findStarter(id: string): AppwriteStarterTemplate | undefined {
  return APPWRITE_STARTERS.find((s) => s.id === id);
}
