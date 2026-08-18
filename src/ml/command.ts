import { executeLoadMlDataset } from './dataset.js';
import type { MlRuntimeConfig } from './env.js';
import type { MlDataset } from './types.js';

export {
  assertNoExtraMlArguments,
  prepareMlCommand,
  prepareMlStatusCommand,
} from './cli.js';

export function executeMlData(config: MlRuntimeConfig): MlDataset {
  return executeLoadMlDataset(config);
}
