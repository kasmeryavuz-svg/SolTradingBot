import { formatProductionStatusLines } from './format.js';

try {
  for (const line of formatProductionStatusLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
