import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MEMORY_DATABASE_PATH } from '../config/defaults.js';

export function resolveDatabasePath(path: string): string {
  return path === MEMORY_DATABASE_PATH ? MEMORY_DATABASE_PATH : resolve(path);
}

export function ensureDatabaseDirectory(path: string): void {
  if (path === MEMORY_DATABASE_PATH) {
    return;
  }

  mkdirSync(dirname(resolveDatabasePath(path)), { recursive: true });
}

export function displayDatabasePath(path: string): string {
  return path;
}
