import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../src/backtest/identity.js';
import { DASHBOARD_DEFINITION_FINGERPRINT } from '../src/dashboard/identity.js';
import { EXECUTION_DEFINITION_FINGERPRINT } from '../src/execution/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../src/exit/identity.js';
import { LIVE_DEFINITION_FINGERPRINT } from '../src/live/identity.js';
import { COST_DEFINITION_FINGERPRINT } from '../src/optimization/costs.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../src/optimization/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../src/performance/identity.js';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../src/research/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { WALLET_DEFINITION_FINGERPRINT } from '../src/wallet/identity.js';
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from '../src/wallet-intelligence/identity.js';
import {
  WALLET_INTELLIGENCE_SPEC_NAME,
  WALLET_INTELLIGENCE_SPEC_VERSION,
} from '../src/wallet-intelligence/constants.js';

function readTree(root: string): string {
  return readdirSync(root, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.ts'))
    .map((name) => readFileSync(join(root, name), 'utf8'))
    .join('\n');
}

describe('wallet intelligence hostile audit prep', () => {
  it('reproves frozen upstream fingerprints and schema 9 with frozen 001-008', () => {
    expect(STRATEGY_DEFINITION_FINGERPRINT).toBe(
      'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd',
    );
    expect(BACKTEST_DEFINITION_FINGERPRINT).toBe(
      '87bca6f2ea8e57b7613d3627b5a5adf37864142b3c62de97849440189ff07fcf',
    );
    expect(PAPER_DEFINITION_FINGERPRINT).toBe(
      '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0',
    );
    expect(POSITION_DEFINITION_FINGERPRINT).toBe(
      '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f',
    );
    expect(EXIT_DEFINITION_FINGERPRINT).toBe(
      '4678a49e73cab2f0076e376506910761f4afcabdcdee4fe3c9830c2395c2e6e6',
    );
    expect(PERFORMANCE_DEFINITION_FINGERPRINT).toBe(
      '9fe2b033c19d5470b972714cc37d32333ac4662ad8d30cdd97b668891454e53c',
    );
    expect(RESEARCH_DEFINITION_FINGERPRINT).toBe(
      '61f5a9d091ce9214e440dddf029f81bb881a907f4cd9193e04ecd3238c20a83a',
    );
    expect(DASHBOARD_DEFINITION_FINGERPRINT).toBe(
      'd4a72c37b15c334171cbd0975cbb9534c3ca836f38923654e22e3685d02c5b18',
    );
    expect(EXECUTION_DEFINITION_FINGERPRINT).toBe(
      '6c9bf5bd42a6137b21b8ed2f4c8939085c7b999add2013efbf7d63a8fc306fd0',
    );
    expect(WALLET_DEFINITION_FINGERPRINT).toBe(
      '2caec72e3ea5fa2c141f9d00f689a23eadaa1f29b403605595abaf6e2d0a7855',
    );
    expect(LIVE_DEFINITION_FINGERPRINT).toBe(
      '57a6fc872f7e51f1e4b041ed5b93413efe0779dea61a88b9dc1b4ed9f05e395d',
    );
    expect(OPTIMIZATION_DEFINITION_FINGERPRINT).toBe(
      '3c2171dc1aee3b0a31bae185e156f0a7236d56d11fe381e83364e8c326c4b979',
    );
    expect(COST_DEFINITION_FINGERPRINT).toBe(
      'da3674208672b3f7c630ac0d3dc9e8cc0818c639fd5e69c62d9d87203757a523',
    );
    expect(LATEST_SCHEMA_VERSION).toBe(9);
    expect(migrationSqlDigest(1)).toBe('7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a');
    expect(migrationSqlDigest(2)).toBe('c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e');
    expect(migrationSqlDigest(3)).toBe('891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c');
    expect(migrationSqlDigest(4)).toBe('eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308');
    expect(migrationSqlDigest(5)).toBe('5435dc4d919729f38474f6cbcdb18a5993b5688d6d97fd31b15fcd75ea26c629');
    expect(migrationSqlDigest(6)).toBe('ddffdd15c0ee0d67e2146854aa6a3adb87c0f0497999de9c80a9bfa4210bdbb0');
    expect(migrationSqlDigest(7)).toBe('d049cf6a2ba8b041f703fe15ab13f1b687a347e4eab6b2b8587a84cd67b404fa');
    expect(migrationSqlDigest(8)).toBe(
      'e4c5ee0d56a8ffe5d916da3bd68d3792f48ac4ffbcce004ababa983d792747d0',
    );
    expect(migrationSqlDigest(9)).toBe(
      'f9f12785034c3181350b279a20e6baa7676fd8c48fb19dd02ce9ead922d12720',
    );
    expect(WALLET_INTELLIGENCE_SPEC_VERSION).toBe('wi18_v1');
    expect(WALLET_INTELLIGENCE_SPEC_NAME).toBe('public_onchain_holder_cohort_intelligence');
    expect(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT).toBe(
      '61e341190e1b8b19a47ed11101932acfebc904b664ee00db7cefff0284d67f32',
    );
    const intelligence = readTree(join(process.cwd(), 'src/wallet-intelligence'));
    expect(intelligence).not.toMatch(/limit:\s*201/);
    expect(readFileSync(join(process.cwd(), 'src/persistence/sqlite/migrations.ts'), 'utf8')).not.toMatch(
      /CAST\s*\(\s*amount_raw/i,
    );
  });

  it('does not connect wallet intelligence to strategy, paper, live, or copy trading', () => {
    const intelligence = readTree(join(process.cwd(), 'src/wallet-intelligence'));
    const strategy = readTree(join(process.cwd(), 'src/strategy'));
    const optimization = readTree(join(process.cwd(), 'src/optimization'));
    const paper = readTree(join(process.cwd(), 'src/paper'));
    const live = readTree(join(process.cwd(), 'src/live'));
    expect(intelligence).not.toMatch(/smartWalletScore|whaleScore|alphaScore|insiderScore|walletQualityScore/);
    expect(intelligence).not.toMatch(/\bcopy this wallet\b|\bfront-run this wallet\b/i);
    expect(intelligence).not.toContain('live:execute');
    expect(strategy).not.toContain('wallet-intelligence');
    expect(optimization).not.toContain('wallet-intelligence');
    expect(paper).not.toContain('wallet-intelligence');
    expect(live).not.toContain('wallet-intelligence');
    expect(intelligence).not.toContain('helius-sdk');
    expect(intelligence).not.toContain('/v1/wallet/');
    expect(intelligence).not.toContain('enhanced-transactions');
    expect(existsSync(join(process.cwd(), 'docs/CHECKPOINT_18.md'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'docs/WALLET_INTELLIGENCE_SOURCES.md'))).toBe(true);
  });
});
