import { config as loadDotenv } from 'dotenv';
import { assertNoExtraRecoveryArguments, prepareRecoveryRunCommand } from './command.js';
import {
  RW0_DATASET_EVIDENCE_CLASSES,
  buildRecoveryDatasetManifest,
  initializeRecoveryDatasetManifest,
  type RecoveryDatasetEvidenceClass,
} from './dataset-manifest.js';
import {
  ensureRecoveryRuntimeDirectory,
  initializeRecoveryDatabase,
  openRecoverySqliteFromConfig,
} from './db/database.js';
import { RecoveryWatcherError } from './errors.js';
import { sanitizeRecoveryErrorMessage } from './sanitizer.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraRecoveryArguments(process.argv, 'recovery:dataset:init');
  const config = prepareRecoveryRunCommand(process.env);
  const evidenceClass = requiredEnv('RW0_DATASET_EVIDENCE_CLASS');
  if (!RW0_DATASET_EVIDENCE_CLASSES.includes(evidenceClass as RecoveryDatasetEvidenceClass)) {
    throw new RecoveryWatcherError(
      'RW0_DATASET_EVIDENCE_CLASS must be retained_forward, disposable, or test.',
      { code: 'configuration' },
    );
  }
  const manifest = buildRecoveryDatasetManifest({
    datasetId: requiredEnv('RW0_DATASET_ID'),
    createdAt: requiredEnv('RW0_DATASET_CREATED_AT'),
    startAt: requiredEnv('RW0_DATASET_START_AT'),
    evidenceClass: evidenceClass as RecoveryDatasetEvidenceClass,
    databasePath: config.databasePath,
  });
  ensureRecoveryRuntimeDirectory(config);
  const database = openRecoverySqliteFromConfig(config);
  try {
    initializeRecoveryDatabase(database);
    const result = initializeRecoveryDatasetManifest(database, manifest);
    console.log(
      `Recovery dataset manifest: ${result.idempotent ? 'existing exact match' : 'initialized'}`,
    );
    console.log(`Dataset id: ${manifest.datasetId}`);
    console.log(`Evidence class: ${manifest.evidenceClass}`);
    console.log(`Created/start: ${manifest.createdAt} / ${manifest.startAt}`);
    console.log(`Manifest fingerprint: ${manifest.manifestFingerprint}`);
    console.log(`Database path fingerprint: ${manifest.databasePathFingerprint}`);
  } finally {
    database.close();
  }
} catch (error: unknown) {
  const message =
    error instanceof RecoveryWatcherError ? error.message : sanitizeRecoveryErrorMessage(error);
  console.error(message);
  process.exitCode = 1;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') {
    throw new RecoveryWatcherError(`${name} is required for recovery:dataset:init.`, {
      code: 'configuration',
    });
  }
  return value;
}
