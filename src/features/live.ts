import { createDexScreenerProvider } from '../market-data/dexscreener/index.js';
import type { MarketDataProvider } from '../market-data/provider.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { scanTokenRisk } from '../risk/service.js';
import { createSolanaRiskDataProvider } from '../risk/solana/provider.js';
import type { RiskDataProvider } from '../risk/provider.js';
import type { TokenRiskReport } from '../risk/types.js';
import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';
import { generateFeatureVector } from './engine.js';
import type { FeatureInputs, FeatureVector } from './types.js';

export async function collectLiveFeatureInputs(options: {
  tokenMint: string;
  marketProvider: MarketDataProvider;
  riskProvider: RiskDataProvider;
  commitment: TokenRiskReport['commitment'];
  previousMarket?: MarketSnapshot | null;
  now?: () => Date;
}): Promise<{ inputs: FeatureInputs; generatedAt: string }> {
  const riskAttempt = await readLiveRisk(options);
  const market = await options.marketProvider.getSnapshot(options.tokenMint);
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();

  return {
    inputs: {
      market,
      previousMarket: options.previousMarket ?? null,
      risk: riskAttempt.risk,
      riskUnavailableReason: riskAttempt.riskUnavailableReason,
      asOf: generatedAt,
    },
    generatedAt,
  };
}

export async function generateLiveFeatureVector(options: {
  tokenMint: string;
  marketProvider: MarketDataProvider;
  riskProvider: RiskDataProvider;
  commitment: TokenRiskReport['commitment'];
  previousMarket?: MarketSnapshot | null;
  now?: () => Date;
}): Promise<FeatureVector> {
  const collected = await collectLiveFeatureInputs(options);
  return generateFeatureVector(collected.inputs, { generatedAt: collected.generatedAt });
}

export function createLiveFeatureProviders(config: {
  rpcUrl: string;
  riskTimeoutMs: number;
  marketTimeoutMs: number;
  commitment: TokenRiskReport['commitment'];
}): {
  marketProvider: MarketDataProvider;
  riskProvider: RiskDataProvider;
} {
  return {
    marketProvider: createDexScreenerProvider({ timeoutMs: config.marketTimeoutMs }),
    riskProvider: createSolanaRiskDataProvider({
      rpcUrl: config.rpcUrl,
      timeoutMs: config.riskTimeoutMs,
      commitment: config.commitment,
    }),
  };
}

async function readLiveRisk(options: {
  tokenMint: string;
  riskProvider: RiskDataProvider;
  commitment: TokenRiskReport['commitment'];
  now?: () => Date;
}): Promise<{ risk: TokenRiskReport | null; riskUnavailableReason: string | null }> {
  try {
    const risk = await scanTokenRisk({
      tokenMint: options.tokenMint,
      provider: options.riskProvider,
      commitment: options.commitment,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
    return { risk, riskUnavailableReason: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      risk: null,
      riskUnavailableReason: sanitizeErrorText(message),
    };
  }
}
