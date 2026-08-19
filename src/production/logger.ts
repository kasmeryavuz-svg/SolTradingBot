import { sanitizeProductionText } from './sanitizer.js';
import type { ProductionLogEvent, ProductionLogger } from './types.js';

export function createStdoutProductionLogger(
  stdout: NodeJS.WritableStream = process.stdout,
  stderr: NodeJS.WritableStream = process.stderr,
): ProductionLogger {
  return {
    write(event: ProductionLogEvent): void {
      const payload = serializeProductionLog(event);
      const line = `${payload}\n`;
      if (event.level === 'error' || event.level === 'warn') {
        stderr.write(line);
        return;
      }
      stdout.write(line);
    },
  };
}

export function serializeProductionLog(event: ProductionLogEvent): string {
  const record: Record<string, string | number | boolean> = {
    timestamp: event.timestamp,
    level: event.level,
    event: event.event,
    specVersion: event.specVersion,
  };
  if (event.cycleNumber !== undefined) {
    record['cycleNumber'] = event.cycleNumber;
  }
  if (event.component !== undefined) {
    record['component'] = event.component;
  }
  if (event.mint !== undefined) {
    record['mint'] = event.mint;
  }
  if (event.result !== undefined) {
    record['result'] = event.result;
  }
  if (event.durationMs !== undefined) {
    record['durationMs'] = event.durationMs;
  }
  if (event.consecutiveFailedCycles !== undefined) {
    record['consecutiveFailedCycles'] = event.consecutiveFailedCycles;
  }
  if (event.message !== undefined) {
    record['message'] = sanitizeProductionText(event.message);
  }
  return JSON.stringify(record);
}
