import { describe, expect, it, vi } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { COMPUTE_BUDGET_PROGRAM_ID } from '../src/execution/constants.js';
import {
  buildJupiterRequest,
  buildJupiterUrl,
  createJupiterBuildClient,
  fingerprintJupiterBuild,
  validateJupiterBuild,
} from '../src/execution/index.js';
import { EXECUTION_DEFINITION_FINGERPRINT, fingerprintExecutionIntent } from '../src/execution/identity.js';
import {
  EXECUTION_TAKER,
  JUPITER_SECRET,
  TOKEN_PROGRAM,
  cuLimitInstructionData,
  cuPriceInstructionData,
  executionIntent,
  instruction,
  jsonFetchResponse,
  validJupiterBuild,
} from './execution-fixtures.js';

function mutateBuild(mutate: (value: Record<string, unknown>) => void): Record<string, unknown> {
  const value = validJupiterBuild();
  mutate(value);
  return value;
}

function firstHop(value: Record<string, unknown>): {
  bps: number;
  swapInfo: { outAmount: string; ammKey: string };
} {
  const hops = value['routePlan'];
  if (!Array.isArray(hops) || hops[0] === undefined) {
    throw new Error('expected a route hop');
  }
  return hops[0] as { bps: number; swapInfo: { outAmount: string; ammKey: string } };
}

function swapInstruction(value: Record<string, unknown>): {
  programId: string;
  data: string;
  accounts: Array<{ pubkey: string; isWritable: boolean; isSigner: boolean }>;
} {
  return value['swapInstruction'] as {
    programId: string;
    data: string;
    accounts: Array<{ pubkey: string; isWritable: boolean; isSigner: boolean }>;
  };
}

describe('Jupiter request contract', () => {
  it('builds the frozen ExactIn request and a code-defined URL', () => {
    const request = buildJupiterRequest(executionIntent());
    expect(request).toEqual({
      inputMint: WRAPPED_SOL_MINT,
      outputMint: USDC_MINT,
      amount: '1000000',
      taker: EXECUTION_TAKER,
      slippageBps: '100',
      maxAccounts: '64',
      blockhashSlotsToExpiry: '150',
      computeUnitPricePercentile: 'high',
      forJitoBundle: 'false',
    });
    const url = new URL(buildJupiterUrl(request));
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('api.jup.ag');
    expect(url.pathname).toBe('/swap/v2/build');
    expect(url.searchParams.get('mode')).toBeNull();
    expect(url.searchParams.get('tipAmount')).toBeNull();
    expect(url.searchParams.get('payer')).toBeNull();
  });
});

describe('Jupiter response validation', () => {
  it('accepts a valid ExactIn /build payload', () => {
    const normalized = validateJupiterBuild(validJupiterBuild(), executionIntent());
    expect(normalized.outAmount).toBe('2000000');
    expect(normalized.computeUnitPriceMicroLamports).toBe(1000n);
  });

  it('rejects hostile provider mutations', () => {
    const intent = executionIntent();
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['inputMint'] = USDC_MINT;
      }), intent),
    ).toThrow(/does not match/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['outputMint'] = WRAPPED_SOL_MINT;
      }), intent),
    ).toThrow(/does not match/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['inAmount'] = '1';
      }), intent),
    ).toThrow(/does not match/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['outAmount'] = '0';
      }), intent),
    ).toThrow(/outAmount/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['otherAmountThreshold'] = '3000000';
      }), intent),
    ).toThrow(/otherAmountThreshold/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['routePlan'] = [];
      }), intent),
    ).toThrow(/routePlan/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        firstHop(value).bps = 9999;
      }), intent),
    ).toThrow(/bps/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        firstHop(value).bps = -1;
      }), intent),
    ).toThrow(/bps/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['swapInstruction'] = undefined;
      }), intent),
    ).toThrow(/swapInstruction/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['tipInstruction'] = instruction(TOKEN_PROGRAM, 'AQID');
      }), intent),
    ).toThrow(/tip instruction/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['blockhashWithMetadata'] = undefined;
      }), intent),
    ).toThrow(/blockhashWithMetadata/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['computeBudgetInstructions'] = [
          instruction(COMPUTE_BUDGET_PROGRAM_ID, cuPriceInstructionData(1n)),
          instruction(COMPUTE_BUDGET_PROGRAM_ID, cuPriceInstructionData(2n)),
        ];
      }), intent),
    ).toThrow(/duplicate SetComputeUnitPrice/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        value['computeBudgetInstructions'] = [
          instruction(COMPUTE_BUDGET_PROGRAM_ID, cuLimitInstructionData(200_000)),
        ];
      }), intent),
    ).toThrow(/compute-unit limit/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        const swap = value['swapInstruction'] as { accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }> };
        swap.accounts.push({ pubkey: TOKEN_PROGRAM, isSigner: true, isWritable: false });
      }), intent),
    ).toThrow(/signer other than the configured public taker/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        const swap = value['swapInstruction'] as { data: string };
        swap.data = '%%%';
      }), intent),
    ).toThrow(/base64/);
    expect(() =>
      validateJupiterBuild(mutateBuild((value) => {
        firstHop(value).swapInfo.ammKey = 'not-an-address';
      }), intent),
    ).toThrow(/ammKey/);
  });

  it('changes the build fingerprint when certified fields mutate', () => {
    const intent = executionIntent();
    const baseBuild = validateJupiterBuild(validJupiterBuild(), intent);
    const base = fingerprintJupiterBuild({
      executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
      executionIntentFingerprint: fingerprintExecutionIntent(intent),
      build: baseBuild,
    });

    const mutations: Array<(value: Record<string, unknown>) => void> = [
      (value) => {
        value['outAmount'] = '2000001';
        value['otherAmountThreshold'] = '1980001';
      },
      (value) => {
        value['otherAmountThreshold'] = '1970000';
      },
      (value) => {
        firstHop(value).swapInfo.outAmount = '1999999';
      },
      (value) => {
        swapInstruction(value).programId = TOKEN_PROGRAM;
      },
      (value) => {
        const account = swapInstruction(value).accounts[1];
        if (account === undefined) {
          throw new Error('expected a second swap account');
        }
        account.pubkey = USDC_MINT;
      },
      (value) => {
        const account = swapInstruction(value).accounts[1];
        if (account === undefined) {
          throw new Error('expected a second swap account');
        }
        account.isWritable = true;
      },
      (value) => {
        swapInstruction(value).data = 'BQQD';
      },
      (value) => {
        value['addressesByLookupTableAddress'] = {
          [TOKEN_PROGRAM]: [WRAPPED_SOL_MINT],
        };
      },
      (value) => {
        const meta = value['blockhashWithMetadata'] as { lastValidBlockHeight: number };
        meta.lastValidBlockHeight = 1001;
      },
      (value) => {
        value['computeBudgetInstructions'] = [
          instruction(COMPUTE_BUDGET_PROGRAM_ID, cuPriceInstructionData(2000n)),
        ];
      },
    ];

    for (const mutate of mutations) {
      const next = validateJupiterBuild(mutateBuild(mutate), intent);
      const fingerprint = fingerprintJupiterBuild({
        executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
        executionIntentFingerprint: fingerprintExecutionIntent(intent),
        build: next,
      });
      expect(fingerprint).not.toBe(base);
    }
  });
});

describe('Jupiter client policy', () => {
  it('uses GET, refuses redirects, and never prints the API key', async () => {
    const fetchImpl = vi.fn((url: string, init: { method: string; redirect: string; headers: Record<string, string> }) => {
      expect(url.startsWith('https://api.jup.ag/swap/v2/build?')).toBe(true);
      expect(init.method).toBe('GET');
      expect(init.redirect).toBe('error');
      expect(init.headers['x-api-key']).toBe(JUPITER_SECRET);
      return Promise.resolve(jsonFetchResponse(validJupiterBuild()));
    });

    const client = createJupiterBuildClient({
      timeoutMs: 5000,
      apiKey: JUPITER_SECRET,
      fetchImpl,
    });
    const payload = await client.build(buildJupiterRequest(executionIntent()));
    expect(validateJupiterBuild(payload, executionIntent()).outAmount).toBe('2000000');
  });

  it('sanitizes HTTP failures and never leaks the API key', async () => {
    for (const status of [400, 401, 403, 429, 500]) {
      const client = createJupiterBuildClient({
        timeoutMs: 5000,
        apiKey: JUPITER_SECRET,
        fetchImpl: () => Promise.resolve(jsonFetchResponse(`error ${JUPITER_SECRET}`, status)),
      });
      await expect(client.build(buildJupiterRequest(executionIntent()))).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).not.toContain(JUPITER_SECRET);
        return true;
      });
    }
  });

  it('rejects HTML, oversized bodies, and redirect responses', async () => {
    const htmlClient = createJupiterBuildClient({
      timeoutMs: 5000,
      fetchImpl: () =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
          body: {
            getReader: () => ({
              read: () => Promise.resolve({ done: true }),
              cancel: () => undefined,
            }),
          },
        }),
    });
    await expect(htmlClient.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(/Content-Type/);

    const hugeClient = createJupiterBuildClient({
      timeoutMs: 5000,
      fetchImpl: () =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers: {
            get: (name: string) => {
              if (name.toLowerCase() === 'content-type') {
                return 'application/json';
              }
              if (name.toLowerCase() === 'content-length') {
                return String(2 * 1024 * 1024 + 1);
              }
              return null;
            },
          },
          arrayBuffer: () => Promise.resolve(new Uint8Array(8)),
        }),
    });
    await expect(hugeClient.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(/2 MiB/);

    const redirectClient = createJupiterBuildClient({
      timeoutMs: 5000,
      fetchImpl: () =>
        Promise.resolve({
          status: 302,
          ok: false,
          headers: { get: () => 'http://127.0.0.1' },
          arrayBuffer: () => Promise.resolve(new Uint8Array()),
        }),
    });
    await expect(redirectClient.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(/redirect/);
  });

  it('cannot be pointed at localhost or attacker hosts', async () => {
    const fetchImpl = vi.fn((url: string) => {
      expect(url).not.toContain('127.0.0.1');
      expect(url).not.toContain('localhost');
      expect(url).not.toContain('attacker.com');
      expect(url).not.toContain('169.254.169.254');
      expect(url.startsWith('https://api.jup.ag/swap/v2/build?')).toBe(true);
      return Promise.resolve(jsonFetchResponse(validJupiterBuild()));
    });
    const client = createJupiterBuildClient({ timeoutMs: 5000, fetchImpl });
    await client.build(buildJupiterRequest(executionIntent()));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
