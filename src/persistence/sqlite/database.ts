import { DatabaseSync } from 'node:sqlite';
import { MEMORY_DATABASE_PATH } from '../../config/defaults.js';
import { PersistenceError } from '../types.js';
import { ensureDatabaseDirectory, resolveDatabasePath } from '../path.js';

export function openSqliteDatabase(options: {
  path: string;
  busyTimeoutMs: number;
}): DatabaseSync {
  const location = resolveDatabasePath(options.path);
  ensureDatabaseDirectory(options.path);

  try {
    const database = new DatabaseSync(location, {
      timeout: options.busyTimeoutMs,
      enableForeignKeyConstraints: true,
    });
    database.exec('PRAGMA foreign_keys = ON');
    if (location !== MEMORY_DATABASE_PATH) {
      database.exec('PRAGMA journal_mode = WAL');
    }
    return database;
  } catch (error: unknown) {
    throw new PersistenceError('Database unavailable. Could not open the local SQLite file.', {
      cause: error,
    });
  }
}

export function readPragmaValue(database: DatabaseSync, pragma: string): string {
  const row = database.prepare(`PRAGMA ${pragma}`).get();
  if (row === undefined) {
    return '';
  }

  const value = Object.values(row)[0];
  return value === null || value === undefined ? '' : String(value);
}
