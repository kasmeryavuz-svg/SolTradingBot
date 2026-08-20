import { config as loadDotenv } from 'dotenv';
import { prepareRecoveryStatusCommand, assertNoExtraRecoveryArguments } from './command.js';
import { RecoveryWatcherError } from './errors.js';
import { formatRecoveryStatusLines } from './format.js';
import { sanitizeRecoveryErrorMessage } from './sanitizer.js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openRecoverySqliteReadOnlyFromConfig } from './db/database.js';
import {
  inspectRecoveryDatasetManifest,
  type RecoveryDatasetMetadata,
} from './dataset-manifest.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraRecoveryArguments(process.argv, 'recovery:status');
  const config = prepareRecoveryStatusCommand(process.env);
  let dataset: RecoveryDatasetMetadata = {
    evidenceClass: 'unclassified',
    populated: false,
    manifest: null,
  };
  if (existsSync(resolve(config.databasePath))) {
    const database = openRecoverySqliteReadOnlyFromConfig(config);
    try {
      dataset = inspectRecoveryDatasetManifest(database, config.databasePath);
    } finally {
      database.close();
    }
  }
  for (const line of formatRecoveryStatusLines(config, dataset)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message =
    error instanceof RecoveryWatcherError ? error.message : sanitizeRecoveryErrorMessage(error);
  console.error(message);
  process.exitCode = 1;
}
