import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraDashboardArguments,
  formatDashboardStartupLines,
  startDashboardServer,
} from './command.js';

loadDotenv({ quiet: true });

const serverPromise = (async () => {
  assertNoExtraDashboardArguments(process.argv);
  const server = await startDashboardServer(process.env);
  const address = server.address();
  for (const line of formatDashboardStartupLines(address.port)) {
    console.log(line);
  }

  const shutdown = (): void => {
    void server.close().finally(() => {
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
})();

void serverPromise.catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
