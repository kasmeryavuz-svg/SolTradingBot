import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runProductionCycle } from '../src/production/cycle.js';
import { loadProductionConfig } from '../src/production/config.js';
import { createFakeClock, mintAt, productionEnv } from './production-fixtures.js';
import type { ProductionLogger } from '../src/production/types.js';

const silentLogger: ProductionLogger = { write: () => undefined };

function readProductionTree(): string {
  return readdirSync(join(process.cwd(), 'src/production'), { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(process.cwd(), 'src/production', name), 'utf8'))
    .join('\n');
}

describe('production has no ML or wallet-intelligence trading', () => {
  it('does not load an ML candidate or run wallet-intel scans', () => {
    const source = readProductionTree();
    expect(source).not.toMatch(/ml\/(?:pipeline|candidate|walk-forward|promotion)/);
    expect(source).not.toMatch(/wallet-intelligence\/(?:scan|holders|inspect)/);
    expect(source).not.toMatch(/STOP_LOSS_BPS|TAKE_PROFIT_BPS|ENTRY_CANDIDATE_LIQUIDITY/);
    expect(source).not.toMatch(/MODEL_SIGNAL_THRESHOLD/);
  });

  it('does not change paper/position decisions when ML or wallet-intel data would change', async () => {
    const mint = mintAt(8);
    const position: string[] = [];
    await runProductionCycle({
      cycleNumber: 1,
      consecutiveFailedCycles: 0,
      config: loadProductionConfig(
        productionEnv({
          PROD20_COLLECTOR_ENABLED: 'false',
          PROD20_PAPER_ENABLED: 'true',
          PROD20_PAPER_MINTS: mint,
        }),
      ),
      dependencies: {
        clock: createFakeClock(),
        logger: silentLogger,
        lookupOpenPosition: () => false,
        executePositionStep: (tokenMint) => {
          position.push(tokenMint);
          return Promise.resolve();
        },
        executeExitStep: () => Promise.reject(new Error('exit should not run')),
      },
    });
    expect(position).toEqual([mint]);
  });
});
