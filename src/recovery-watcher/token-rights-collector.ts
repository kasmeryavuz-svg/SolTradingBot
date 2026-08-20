import { parseMintAccountResponseAllowUnsupported } from '../risk/solana/parser.js';
import type { RiskDataProvider } from '../risk/provider.js';
import type { RiskCommitment } from '../risk/types.js';
import { RiskProviderUnavailableError, RiskScanError, type TokenExtensionObservation } from '../risk/types.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import type { TokenRightsSafetyPayload } from './types.js';

export type TokenRightsMintProvider = Pick<RiskDataProvider, 'getMintAccount'>;

export type TokenRightsCollectionProvenance = {
  contextSlot: number | null;
  commitment: RiskCommitment;
  source: string;
  observedAt: string;
  collectedAt: string;
};

export type TokenRightsCollectionSuccess = {
  kind: 'success';
  tokenMint: string;
  payload: TokenRightsSafetyPayload;
  provenance: TokenRightsCollectionProvenance;
};

export type TokenRightsCollectionUnavailable = {
  kind: 'unavailable';
  tokenMint: string;
  payload: null;
  provenance: TokenRightsCollectionProvenance;
  reason: string;
};

export type TokenRightsCollectionResult =
  | TokenRightsCollectionSuccess
  | TokenRightsCollectionUnavailable;

export type CollectTokenRightsOptions = {
  provider: TokenRightsMintProvider;
  tokenMint: string;
  commitment?: RiskCommitment;
  source?: string;
  now?: () => Date;
};

const DEFAULT_SOURCE = 'solana_rpc.getAccountInfo(jsonParsed)';

/**
 * Collects only the mint-account facts needed by the recovery token-rights gate.
 * Provider failures are recoverable; malformed or internally inconsistent mint
 * responses remain fatal parser errors.
 */
export async function collectTokenRights(
  options: CollectTokenRightsOptions,
): Promise<TokenRightsCollectionResult> {
  const { provider, tokenMint } = options;
  if (!isPlausibleSolanaMint(tokenMint)) {
    throw new RiskScanError('Token mint is malformed.');
  }

  const commitment = options.commitment ?? 'finalized';
  const source = options.source ?? DEFAULT_SOURCE;
  const now = options.now ?? (() => new Date());
  const observedAt = now().toISOString();

  let response: Awaited<ReturnType<TokenRightsMintProvider['getMintAccount']>>;
  try {
    response = await provider.getMintAccount(tokenMint);
  } catch (error) {
    if (!(error instanceof RiskProviderUnavailableError)) throw error;
    return {
      kind: 'unavailable',
      tokenMint,
      payload: null,
      provenance: {
        contextSlot: null,
        commitment,
        source,
        observedAt,
        collectedAt: now().toISOString(),
      },
      reason: error instanceof Error ? error.message : 'Mint account provider unavailable.',
    };
  }

  const collectedAt = now().toISOString();
  const parsed = parseMintAccountResponseAllowUnsupported(response);
  if (parsed.tokenProgram === 'unsupported') {
    return {
      kind: 'success',
      tokenMint,
      payload: {
        kind: 'token_rights',
        tokenProgram: 'unsupported',
        mintAuthority: null,
        freezeAuthority: null,
        extensions: [],
        factsComplete: false,
      },
      provenance: {
        contextSlot: parsed.mintContextSlot,
        commitment,
        source,
        observedAt,
        collectedAt,
      },
    };
  }

  const extensions: readonly TokenExtensionObservation[] = parsed.extensions;
  const factsComplete =
    parsed.tokenProgram === 'spl_token' ||
    extensions.every((extension) => extension.parsed && extension.classified);

  return {
    kind: 'success',
    tokenMint,
    payload: {
      kind: 'token_rights',
      tokenProgram: parsed.tokenProgram,
      mintAuthority: parsed.mintAuthority,
      freezeAuthority: parsed.freezeAuthority,
      extensions,
      factsComplete,
    },
    provenance: {
      contextSlot: parsed.mintContextSlot,
      commitment,
      source,
      observedAt,
      collectedAt,
    },
  };
}
