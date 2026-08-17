import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled, TradingSafetyError } from '../core/safety.js';
import { DashboardError, DASHBOARD_TRADING_ENABLED_REFUSAL } from './errors.js';
import { createDashboardServer, type DashboardHttpServer } from './server.js';
import type { DashboardClock } from './types.js';

export { DASHBOARD_TRADING_ENABLED_REFUSAL };

export function prepareDashboardCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  try {
    assertTradingDisabled(config);
  } catch (error: unknown) {
    if (error instanceof TradingSafetyError) {
      throw new DashboardError(DASHBOARD_TRADING_ENABLED_REFUSAL, { cause: error });
    }
    throw error;
  }
  return config;
}

export function assertNoExtraDashboardArguments(argv: readonly string[]): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new DashboardError('Unexpected extra arguments. Usage: npm run dashboard:start');
  }
}

export async function startDashboardServer(
  source: EnvSource,
  options: { clock?: DashboardClock } = {},
): Promise<DashboardHttpServer> {
  const config = prepareDashboardCommand(source);
  const server = createDashboardServer({
    config,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });
  await server.listen();
  return server;
}

export function formatDashboardStartupLines(port: number): string[] {
  return [
    'SolTradingBot Dashboard',
    `http://127.0.0.1:${String(port)}`,
    'LOCAL READ ONLY',
    'Trading capability: disabled',
    'External dashboard network calls: disabled',
  ];
}
