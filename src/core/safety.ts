export class TradingSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TradingSafetyError';
  }
}

/**
 * Checkpoint 00 safety rule: live trading is not implemented.
 * The process must not start when TRADING_ENABLED=true.
 */
export function assertTradingDisabled(config: { tradingEnabled: boolean }): void {
  if (config.tradingEnabled) {
    throw new TradingSafetyError(
      'Refusing to start because TRADING_ENABLED=true. Live trading capability has not been implemented. This project is at Checkpoint 00 (project foundation only). Set TRADING_ENABLED=false to continue.',
    );
  }
}
