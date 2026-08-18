import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import {
  assertLiveAmount,
  assertLiveExecuteGates,
  assertLivePair,
  assertNoConfirmationBypassEnv,
  assertNoExtraLiveArguments,
} from '../src/live/gates.js';
import { LiveError } from '../src/live/errors.js';
import { executeLiveStatus } from '../src/live/index.js';

describe('live gates', () => {
  it('requires both TRADING_ENABLED and LIVE_BROADCAST_ENABLED for execute', () => {
    expect(() => {
      assertLiveExecuteGates(loadConfig({}));
    }).toThrow(LiveError);
    expect(() => {
      assertLiveExecuteGates(loadConfig({ TRADING_ENABLED: 'true', LIVE_BROADCAST_ENABLED: 'false' }));
    }).toThrow(/LIVE_BROADCAST_ENABLED/);
    expect(() => {
      assertLiveExecuteGates(loadConfig({ TRADING_ENABLED: 'false', LIVE_BROADCAST_ENABLED: 'true' }));
    }).toThrow(/TRADING_ENABLED/);
    expect(() => {
      assertLiveExecuteGates(loadConfig({ TRADING_ENABLED: 'true', LIVE_BROADCAST_ENABLED: 'true' }));
    }).not.toThrow();
  });

  it('refuses any pair other than WSOL → USDC', () => {
    expect(() => {
      assertLivePair({ inputMint: WRAPPED_SOL_MINT, outputMint: USDC_MINT });
    }).not.toThrow();
    expect(() => {
      assertLivePair({ inputMint: USDC_MINT, outputMint: WRAPPED_SOL_MINT });
    }).toThrow(/unsupported_live_pair|WSOL/);
  });

  it('refuses amountRaw above 1_000_000 lamports', () => {
    expect(assertLiveAmount('1000000')).toBe(1_000_000n);
    expect(() => {
      assertLiveAmount('1000001');
    }).toThrow(LiveError);
  });

  it('refuses unexpected argv and confirmation bypass flags/env', () => {
    expect(() => {
      assertNoExtraLiveArguments(['node', 'execute.ts', '--yes'], 'live:execute');
    }).toThrow(/bypass|extra arguments/);
    expect(() => {
      assertNoExtraLiveArguments(['node', 'execute.ts', '-y'], 'live:execute');
    }).toThrow(LiveError);
    expect(() => {
      assertNoConfirmationBypassEnv({ AUTO_CONFIRM: 'true' });
    }).toThrow(LiveError);
    expect(() => {
      assertNoExtraLiveArguments(['node', 'status.ts'], 'live:status');
    }).not.toThrow();
  });

  it('lets live:status describe trading flags without sending', () => {
    const report = executeLiveStatus({
      TRADING_ENABLED: 'true',
      LIVE_BROADCAST_ENABLED: 'false',
    });
    expect(report.tradingEnabled).toBe(true);
    expect(report.liveBroadcastEnabled).toBe(false);
    expect(report.jito).toBe('disabled');
    expect(report.automaticTrading).toBe('unavailable');
    expect(report.pair).toBe('WSOL → USDC ONLY');
  });
});
