import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_PATH } from '../src/config/defaults.js';
import { DEFAULT_RW0_DATABASE_PATH } from '../src/recovery-watcher/constants.js';
import { RecoveryWatcherError } from '../src/recovery-watcher/errors.js';
import { formatRecoveryStatusLines } from '../src/recovery-watcher/format.js';
import { RW0_WATCHER_DEFINITION_FINGERPRINT } from '../src/recovery-watcher/identity.js';
import { loadRecoveryWatcherConfig } from '../src/recovery-watcher/config.js';
import { prepareRecoveryStatusCommand } from '../src/recovery-watcher/command.js';

describe('recovery:status', () => {
  it('reports rw0_v1 paper/data research identity and the isolated DB path', () => {
    const config = prepareRecoveryStatusCommand({
      TRADING_ENABLED: 'false',
      LIVE_BROADCAST_ENABLED: 'false',
    });
    const text = formatRecoveryStatusLines(config).join('\n');
    expect(config.databasePath).toBe(DEFAULT_RW0_DATABASE_PATH);
    expect(config.databasePath).not.toBe(DEFAULT_DATABASE_PATH);
    expect(text).toContain('Spec: rw0_v1');
    expect(text).toContain(`Watcher fingerprint: ${RW0_WATCHER_DEFINITION_FINGERPRINT}`);
    expect(text).toContain('Mode: PAPER / DATA RESEARCH ONLY');
    expect(text).toContain('TRADING_ENABLED: false');
    expect(text).toContain('LIVE_BROADCAST_ENABLED: false');
    expect(text).toContain('Intended recovery DB path: recovery-watcher.sqlite');
    expect(text).toContain('Configured production DB path: soltradingbot.sqlite');
    expect(text).not.toMatch(/Intended recovery DB path: soltradingbot\.sqlite/);
    expect(text).toContain('Holder gate: UNKNOWN');
    expect(text).toContain('Bundle gate: UNKNOWN');
    expect(text).toContain('SHADOW_RESEARCH_OPEN is the only simulation path');
    expect(text).toContain('PAPER_ELIGIBLE / PAPER_OPEN names are reserved and unreachable in rw0_v1');
    expect(text).toContain('Manually setting holder/bundle/creator PASS cannot reach PAPER');
    expect(text).toContain('historical percentages are not proof');
    expect(text).toContain('Network polling: NOT IMPLEMENTED IN THIS SLICE');
    expect(text).toContain('Shadow exit/CLOSED: NOT IMPLEMENTED IN rw0_v1');
    expect(text).toContain('legal only when recoveryConfirmedAt < watchStartedAt + 2h TTL');
    expect(text).toContain('UNKNOWN-only in rw0_v1');
    expect(text).toContain('Runtime RW0_DATABASE_PATH=:memory: REJECTED');
  });

  it('does not inherit production DATABASE_PATH as the recovery database', () => {
    const config = loadRecoveryWatcherConfig({
      DATABASE_PATH: DEFAULT_DATABASE_PATH,
      TRADING_ENABLED: 'false',
      LIVE_BROADCAST_ENABLED: 'false',
    });
    expect(config.databasePath).toBe(DEFAULT_RW0_DATABASE_PATH);
    expect(config.configuredProductionDatabasePath).toBe(DEFAULT_DATABASE_PATH);
  });

  it.each([{ TRADING_ENABLED: 'true' }, { LIVE_BROADCAST_ENABLED: 'true' }])(
    'fails closed when live flags are enabled %o',
    (flags) => {
      expect(() => prepareRecoveryStatusCommand({ ...flags })).toThrow(RecoveryWatcherError);
    },
  );

  it('fails closed if RW0_DATABASE_PATH points at production sqlite', () => {
    expect(() =>
      loadRecoveryWatcherConfig({
        RW0_DATABASE_PATH: DEFAULT_DATABASE_PATH,
        TRADING_ENABLED: 'false',
        LIVE_BROADCAST_ENABLED: 'false',
      }),
    ).toThrow(/must not be the production SQLite file/);
  });

  it('fails closed if RW0_DATABASE_PATH resolves to a custom DATABASE_PATH', () => {
    expect(() =>
      loadRecoveryWatcherConfig({
        DATABASE_PATH: '/app/data/market.sqlite',
        RW0_DATABASE_PATH: '/app/data/market.sqlite',
        TRADING_ENABLED: 'false',
        LIVE_BROADCAST_ENABLED: 'false',
      }),
    ).toThrow(/must not be the production SQLite file/);
  });

  it('rejects RW0_DATABASE_PATH=:memory: from normal runtime config', () => {
    expect(() =>
      loadRecoveryWatcherConfig({
        RW0_DATABASE_PATH: ':memory:',
        TRADING_ENABLED: 'false',
        LIVE_BROADCAST_ENABLED: 'false',
      }),
    ).toThrow(/:memory: is not allowed/);
  });
});
