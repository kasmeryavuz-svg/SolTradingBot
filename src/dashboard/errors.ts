export class DashboardError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DashboardError';
  }
}

export const DASHBOARD_TRADING_ENABLED_REFUSAL =
  'Dashboard refuses to start because TRADING_ENABLED=true. Checkpoint 13 dashboard is read-only only.';
