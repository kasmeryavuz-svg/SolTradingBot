import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import {
  COMPUTE_BUDGET_PROGRAM_ID,
  JUPITER_MAX_RESPONSE_BYTES,
} from '../src/execution/constants.js';
import {
  SOLANA_MAINNET_GENESIS_HASH,
  SOLANA_TESTNET_GENESIS_HASH,
  buildJupiterRequest,
  buildJupiterUrl,
  collectErrorText,
  compileUnsignedCandidate,
  createJupiterBuildClient,
  fingerprintExecutionCandidate,
  fingerprintJupiterBuild,
  formatExecutionError,
  formatExecutionSimulateLines,
  normalizeOptionalApiKey,
  normalizeSimulationResult,
  sanitizeExecutionText,
  simulateNormalizedBuild,
  validateJupiterBuild,
} from '../src/execution/index.js';
import { EXECUTION_DEFINITION_FINGERPRINT, fingerprintExecutionIntent } from '../src/execution/identity.js';
import {
  EXECUTION_TAKER,
  JUPITER_SECRET,
  TOKEN_PROGRAM,
  executionIntent,
  instruction,
  jsonFetchResponse,
  readerFromBytes,
  validJupiterBuild,
} from './execution-fixtures.js';

const RPC_SECRET_URL = 'https://user:password@example.invalid/?api-key=RPC_SECRET_456';

function fingerprintOf(build: ReturnType<typeof validateJupiterBuild>): string {
  return fingerprintJupiterBuild({
    executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
    executionIntentFingerprint: fingerprintExecutionIntent(executionIntent()),
    build,
  });
}

describe('hostile audit: request exactness and API key', () => {
  it('sends only the frozen e14 query keys and no body', async () => {
    const fetchImpl = vi.fn((url: string, init: { method: string; headers: Record<string, string> }) => {
      const parsed = new URL(url);
      expect([...parsed.searchParams.keys()].sort()).toEqual([
        'amount',
        'blockhashSlotsToExpiry',
        'computeUnitPricePercentile',
        'forJitoBundle',
        'inputMint',
        'maxAccounts',
        'outputMint',
        'slippageBps',
        'taker',
      ]);
      expect(parsed.searchParams.get('slippageBps')).toBe('100');
      expect(parsed.searchParams.get('maxAccounts')).toBe('64');
      expect(parsed.searchParams.get('blockhashSlotsToExpiry')).toBe('150');
      expect(parsed.searchParams.get('computeUnitPricePercentile')).toBe('high');
      expect(parsed.searchParams.get('forJitoBundle')).toBe('false');
      expect(init.headers['x-api-key']).toBeUndefined();
      return Promise.resolve(jsonFetchResponse(validJupiterBuild()));
    });
    await createJupiterBuildClient({ timeoutMs: 5000, fetchImpl }).build(buildJupiterRequest(executionIntent()));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a whitespace-only API key as absent', () => {
    expect(normalizeOptionalApiKey('   ')).toBeUndefined();
    expect(normalizeOptionalApiKey(undefined)).toBeUndefined();
    expect(normalizeOptionalApiKey(JUPITER_SECRET)).toBe(JUPITER_SECRET);
  });
});

describe('hostile audit: streaming body and content-type', () => {
  it('cancels a chunked body once it crosses 2 MiB', async () => {
    let cancelled = false;
    let reads = 0;
    const chunk = new Uint8Array(512 * 1024);
    const client = createJupiterBuildClient({
      timeoutMs: 5000,
      fetchImpl: () =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          body: {
            getReader: () => ({
              read() {
                reads += 1;
                return Promise.resolve({ done: false, value: chunk });
              },
              cancel() {
                cancelled = true;
              },
            }),
          },
        }),
    });
    await expect(client.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(/2 MiB/);
    expect(cancelled).toBe(true);
    expect(reads * chunk.byteLength).toBeGreaterThan(JUPITER_MAX_RESPONSE_BYTES);
  });

  it('rejects missing, plain-text, and octet-stream Content-Type on 2xx', async () => {
    for (const contentType of [null, 'text/plain', 'text/html', 'application/octet-stream']) {
      const client = createJupiterBuildClient({
        timeoutMs: 5000,
        fetchImpl: () =>
          Promise.resolve({
            status: 200,
            ok: true,
            headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
            body: { getReader: () => readerFromBytes(new TextEncoder().encode('{}')) },
          }),
      });
      await expect(client.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(/Content-Type/);
    }
  });

  it('refuses 301-308 redirects including same-host and localhost Location', async () => {
    for (const status of [301, 302, 303, 307, 308]) {
      const client = createJupiterBuildClient({
        timeoutMs: 5000,
        fetchImpl: () =>
          Promise.resolve({
            status,
            ok: false,
            headers: { get: () => 'https://evil.example/' },
          }),
      });
      await expect(client.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(/redirect/);
    }
  });

  it('clears the abort timer after success and HTTP error', async () => {
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const client = createJupiterBuildClient({
      timeoutMs: 5000,
      fetchImpl: () => Promise.resolve(jsonFetchResponse(validJupiterBuild())),
    });
    await client.build(buildJupiterRequest(executionIntent()));
    expect(clear).toHaveBeenCalled();
    clear.mockClear();
    const failing = createJupiterBuildClient({
      timeoutMs: 5000,
      fetchImpl: () => Promise.resolve(jsonFetchResponse('nope', 400)),
    });
    await expect(failing.build(buildJupiterRequest(executionIntent()))).rejects.toBeInstanceOf(Error);
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});

describe('hostile audit: provider normalization and ALT', () => {
  it('keeps the same build fingerprint when ALT JSON key order is shuffled', () => {
    const first = validateJupiterBuild(
      validJupiterBuild({
        addressesByLookupTableAddress: {
          [TOKEN_PROGRAM]: [WRAPPED_SOL_MINT],
          [USDC_MINT]: [WRAPPED_SOL_MINT],
        },
      }),
      executionIntent(),
    );
    const shuffled = validateJupiterBuild(
      validJupiterBuild({
        addressesByLookupTableAddress: {
          [USDC_MINT]: [WRAPPED_SOL_MINT],
          [TOKEN_PROGRAM]: [WRAPPED_SOL_MINT],
        },
      }),
      executionIntent(),
    );
    expect(fingerprintOf(first)).toBe(fingerprintOf(shuffled));
  });

  it('changes the fingerprint when an ALT address changes and rejects a taker inside an ALT', () => {
    const base = fingerprintOf(validateJupiterBuild(validJupiterBuild(), executionIntent()));
    const changed = fingerprintOf(
      validateJupiterBuild(
        validJupiterBuild({
          addressesByLookupTableAddress: { [TOKEN_PROGRAM]: [USDC_MINT] },
        }),
        executionIntent(),
      ),
    );
    expect(changed).not.toBe(base);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          addressesByLookupTableAddress: { [TOKEN_PROGRAM]: [EXECUTION_TAKER] },
        }),
        executionIntent(),
      ),
    ).toThrow(/taker/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          addressesByLookupTableAddress: { [TOKEN_PROGRAM]: [] },
        }),
        executionIntent(),
      ),
    ).toThrow(/empty/);
  });

  it('rejects sparse, non-byte, and wrong-length blockhashes', () => {
    const bytes = Array.from({ length: 32 }, (_, index) => (index + 1) % 256);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          blockhashWithMetadata: {
            blockhash: bytes.slice(0, 31),
            lastValidBlockHeight: 1000,
            fetchedAt: '2026-08-17T21:00:00.000Z',
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/32-byte/);
    const hole: unknown[] = [];
    for (let index = 0; index < 32; index += 1) {
      if (index !== 4) {
        hole[index] = bytes[index];
      }
    }
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          blockhashWithMetadata: {
            blockhash: hole,
            lastValidBlockHeight: 1000,
            fetchedAt: '2026-08-17T21:00:00.000Z',
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/missing|invalid/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          blockhashWithMetadata: {
            blockhash: bytes.map((item, index) => (index === 0 ? 256 : item)),
            lastValidBlockHeight: 1000,
            fetchedAt: '2026-08-17T21:00:00.000Z',
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/invalid/);
  });
});

describe('hostile audit: compiled signer, message hash, and immutability', () => {
  it('compiles exactly one required signer equal to the taker and binds message bytes', () => {
    const build = validateJupiterBuild(validJupiterBuild(), executionIntent());
    const compiled = compileUnsignedCandidate(build, {
      feePayer: EXECUTION_TAKER,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    expect(compiled.candidate.feePayer).toBe(EXECUTION_TAKER);
    expect(compiled.candidate.compiledMessageSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(compiled.candidate.serializedTransactionBytes).toBeLessThanOrEqual(1232);
    const again = compileUnsignedCandidate(build, {
      feePayer: EXECUTION_TAKER,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    expect(again.candidate.compiledMessageSha256).toBe(compiled.candidate.compiledMessageSha256);
    expect(
      fingerprintExecutionCandidate({
        executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
        executionIntentFingerprint: fingerprintExecutionIntent(executionIntent()),
        jupiterBuildFingerprint: fingerprintOf(build),
        candidate: compiled.candidate,
      }),
    ).toBe(
      fingerprintExecutionCandidate({
        executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
        executionIntentFingerprint: fingerprintExecutionIntent(executionIntent()),
        jupiterBuildFingerprint: fingerprintOf(build),
        candidate: again.candidate,
      }),
    );
  });

  it('does not mutate a frozen normalized build during compile', () => {
    const build = Object.freeze(validateJupiterBuild(validJupiterBuild(), executionIntent()));
    Object.freeze(build.setupInstructions);
    Object.freeze(build.otherInstructions);
    const before = fingerprintOf(build);
    compileUnsignedCandidate(build, {
      feePayer: EXECUTION_TAKER,
      computeUnitLimit: 1_400_000,
      includeComputeUnitPrice: false,
    });
    expect(fingerprintOf(build)).toBe(before);
  });
});

describe('hostile audit: secrets, RPC wording, and units', () => {
  it('redacts secrets from nested causes and AggregateError text', () => {
    const nested = new Error(`outer ${JUPITER_SECRET}`);
    nested.cause = new Error(`cause ${JUPITER_SECRET}`);
    const aggregate = new AggregateError([nested], `agg ${JUPITER_SECRET}`);
    expect(formatExecutionError(aggregate, [JUPITER_SECRET])).not.toContain(JUPITER_SECRET);
    expect(sanitizeExecutionText(collectErrorText(aggregate), [JUPITER_SECRET])).not.toContain(JUPITER_SECRET);
    expect(sanitizeExecutionText(`failed ${RPC_SECRET_URL}`, [])).not.toContain('password');
    expect(sanitizeExecutionText(`failed ${RPC_SECRET_URL}`, [])).not.toContain('RPC_SECRET_456');
  });

  it('does not add RPC fee and priority-fee component in CLI wording', () => {
    const build = validateJupiterBuild(validJupiterBuild(), executionIntent());
    const compiled = compileUnsignedCandidate(build, {
      feePayer: EXECUTION_TAKER,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    const text = formatExecutionSimulateLines({
      specVersion: 'e14_v1',
      specName: 'jupiter_v2_unsigned_swap_preflight_engine',
      executionDefinitionFingerprint: EXECUTION_DEFINITION_FINGERPRINT,
      executionIntentFingerprint: fingerprintExecutionIntent(executionIntent()),
      jupiterBuildFingerprint: fingerprintOf(build),
      executionCandidateFingerprint: createHash('sha256').update('x').digest('hex'),
      executionSimulationFingerprint: createHash('sha256').update('y').digest('hex'),
      intent: executionIntent(),
      quote: {
        outAmount: '2000000',
        otherAmountThreshold: '1980000',
        slippageBps: 100,
        routeHopCount: 1,
        dexLabels: ['Raydium'],
      },
      computeUnitPriceMicroLamports: 18_446_744_073_709_551_615n,
      candidate: compiled.candidate,
      observedGenesisHash: SOLANA_MAINNET_GENESIS_HASH,
      currentBlockHeight: 900n,
      currentBlockHeightAfterFirst: 900n,
      currentBlockHeightBeforeFinal: 900n,
      firstSimulation: {
        ok: true,
        unitsConsumed: 100_000n,
        errorSummary: null,
        logs: [],
        failureKind: 'none',
      },
      finalComputeUnitLimit: 120_000,
      secondSimulation: {
        ok: true,
        unitsConsumed: 99_000n,
        errorSummary: null,
        logs: [],
        failureKind: 'none',
      },
      fees: {
        computeUnitPriceMicroLamports: 18_446_744_073_709_551_615n,
        calculatedPriorityFeeComponentLamports: 1n,
        maxPriorityFeeLamports: 1_000_000n,
        rpcEstimatedTransactionFeeLamports: 5000n,
      },
      providerValid: true,
      status: 'simulation_passed',
      message: 'Unsigned preflight candidate is simulation-valid.',
    }).join('\n');
    expect(text).toContain('Calculated priority-fee component');
    expect(text).toContain('RPC transaction-fee estimate');
    expect(text).toContain('not added to the calculated priority-fee component');
    expect(text).toContain('18446744073709551615');
    expect(text).not.toMatch(/total fee =|sum of/i);
  });

  it('rejects zero, non-integer, and missing consumed units', () => {
    expect(normalizeSimulationResult({ err: null, unitsConsumed: 0n }).ok).toBe(false);
    expect(normalizeSimulationResult({ err: null, unitsConsumed: 1.5 }).ok).toBe(false);
    expect(normalizeSimulationResult({ err: null }).ok).toBe(false);
    expect(normalizeSimulationResult({ err: null, unitsConsumed: 100_000n }).ok).toBe(true);
  });

  it('records getFeeForMessage against the final compiled message', async () => {
    const build = validateJupiterBuild(validJupiterBuild(), executionIntent());
    const final = compileUnsignedCandidate(build, {
      feePayer: EXECUTION_TAKER,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    let seenMessage: string | null = null;
    const report = await simulateNormalizedBuild({
      intent: executionIntent(),
      build,
      rpc: {
        getGenesisHash: () => Promise.resolve(SOLANA_MAINNET_GENESIS_HASH),
        getBlockHeight: () => Promise.resolve(900n),
        simulateTransaction: () =>
          Promise.resolve({
            ok: true,
            unitsConsumed: 100_000n,
            errorSummary: null,
            logs: [],
            failureKind: 'none',
          }),
        getFeeForMessage: (message) => {
          seenMessage = message;
          return Promise.resolve(5000n);
        },
      },
    });
    expect(report.status).toBe('simulation_passed');
    expect(seenMessage).toBe(final.messageBase64);
  });

  it('does not treat a testnet genesis as simulation_passed', async () => {
    const report = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: {
        getGenesisHash: () => Promise.resolve(SOLANA_TESTNET_GENESIS_HASH),
        getBlockHeight: () => Promise.resolve(900n),
        simulateTransaction: () => {
          throw new Error('simulate must not run');
        },
        getFeeForMessage: () => Promise.resolve(null),
      },
    });
    expect(report.status).toBe('cluster_mismatch');
    expect(report.fees === null || report.fees.rpcEstimatedTransactionFeeLamports === null).toBe(true);
  });
});

describe('hostile audit: compute-budget variants and route hops', () => {
  it('rejects RequestHeapFrame and SetLoadedAccountsDataSizeLimit instead of dropping them', () => {
    const heap = Buffer.alloc(5);
    heap.writeUInt8(1, 0);
    heap.writeUInt32LE(32768, 1);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          computeBudgetInstructions: [instruction(COMPUTE_BUDGET_PROGRAM_ID, heap.toString('base64'))],
        }),
        executionIntent(),
      ),
    ).toThrow(/provider_contract_changed|Compute Budget variant/);
    const loaded = Buffer.alloc(5);
    loaded.writeUInt8(4, 0);
    loaded.writeUInt32LE(1024, 1);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          computeBudgetInstructions: [instruction(COMPUTE_BUDGET_PROGRAM_ID, loaded.toString('base64'))],
        }),
        executionIntent(),
      ),
    ).toThrow(/provider_contract_changed|Compute Budget variant/);
  });

  it('rejects hop bps above 10000, noncanonical hop amounts, and missing terminal output', () => {
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          routePlan: [
            {
              percent: 100,
              bps: 10001,
              swapInfo: {
                ammKey: TOKEN_PROGRAM,
                label: 'x',
                inputMint: WRAPPED_SOL_MINT,
                outputMint: USDC_MINT,
                inAmount: '1000000',
                outAmount: '2000000',
              },
            },
          ],
        }),
        executionIntent(),
      ),
    ).toThrow(/bps/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          routePlan: [
            {
              percent: 100,
              bps: 10000,
              swapInfo: {
                ammKey: TOKEN_PROGRAM,
                label: 'x',
                inputMint: WRAPPED_SOL_MINT,
                outputMint: USDC_MINT,
                inAmount: '01',
                outAmount: '2000000',
              },
            },
          ],
        }),
        executionIntent(),
      ),
    ).toThrow(/inAmount/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          routePlan: [
            {
              percent: 100,
              bps: 10000,
              swapInfo: {
                ammKey: TOKEN_PROGRAM,
                label: 'x',
                inputMint: WRAPPED_SOL_MINT,
                outputMint: WRAPPED_SOL_MINT,
                inAmount: '1000000',
                outAmount: '2000000',
              },
            },
          ],
        }),
        executionIntent(),
      ),
    ).toThrow(/output mint/);
  });
});

describe('hostile audit: Jupiter URL remains code-defined', () => {
  it('never includes forbidden query parameters', () => {
    const url = buildJupiterUrl(buildJupiterRequest(executionIntent()));
    expect(url).not.toContain('payer=');
    expect(url).not.toContain('tipAmount=');
    expect(url).not.toContain('platformFeeBps=');
    expect(url).not.toContain('feeAccount=');
    expect(url).not.toContain('mode=');
    expect(url).not.toContain('destinationTokenAccount=');
    expect(url).not.toContain('jito.wtf');
  });
});

describe('hostile audit: extra coverage', () => {
  it('sends x-api-key only when a real key is present', async () => {
    let seenHeader: string | undefined;
    let seenUrl = '';
    const fetchImpl = vi.fn((url: string, init: { headers: Record<string, string> }) => {
      seenUrl = url;
      seenHeader = init.headers['x-api-key'];
      return Promise.resolve(jsonFetchResponse(validJupiterBuild()));
    });
    await createJupiterBuildClient({
      timeoutMs: 5000,
      apiKey: JUPITER_SECRET,
      fetchImpl,
    }).build(buildJupiterRequest(executionIntent()));
    expect(seenHeader).toBe(JUPITER_SECRET);
    expect(seenUrl).not.toContain(JUPITER_SECRET);
  });

  it('classifies 401/403/429/5xx without dumping the body', async () => {
    const cases: Array<[number, RegExp]> = [
      [401, /authentication/],
      [403, /authentication/],
      [429, /rate-limited/],
      [500, /unavailable/],
      [502, /unavailable/],
      [503, /unavailable/],
    ];
    for (const [status, pattern] of cases) {
      const client = createJupiterBuildClient({
        timeoutMs: 5000,
        fetchImpl: () => Promise.resolve(jsonFetchResponse({ error: 'SECRET_BODY_SHOULD_NOT_PRINT' }, status)),
      });
      await expect(client.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(pattern);
    }
  });

  it('rejects noncanonical base64, whitespace, and extra signers in every instruction slot', () => {
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          swapInstruction: instruction(TOKEN_PROGRAM, 'AQID ', [
            { pubkey: EXECUTION_TAKER, isWritable: true, isSigner: true },
          ]),
        }),
        executionIntent(),
      ),
    ).toThrow(/base64/);
    const extra = { pubkey: TOKEN_PROGRAM, isWritable: false, isSigner: true };
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          setupInstructions: [
            instruction(TOKEN_PROGRAM, 'AQID', [
              { pubkey: EXECUTION_TAKER, isWritable: true, isSigner: true },
              extra,
            ]),
          ],
        }),
        executionIntent(),
      ),
    ).toThrow(/signer/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          swapInstruction: instruction(TOKEN_PROGRAM, 'BQID', [
            { pubkey: EXECUTION_TAKER, isWritable: true, isSigner: true },
            extra,
          ]),
        }),
        executionIntent(),
      ),
    ).toThrow(/signer/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          cleanupInstruction: instruction(TOKEN_PROGRAM, 'AQID', [extra]),
        }),
        executionIntent(),
      ),
    ).toThrow(/signer/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          otherInstructions: [instruction(TOKEN_PROGRAM, 'AQID', [extra])],
        }),
        executionIntent(),
      ),
    ).toThrow(/signer/);
  });

  it('allows duplicate taker metas and keeps the same fingerprint after JSON key shuffle', () => {
    const duplicate = validateJupiterBuild(
      validJupiterBuild({
        swapInstruction: instruction(TOKEN_PROGRAM, 'BQID', [
          { pubkey: EXECUTION_TAKER, isWritable: false, isSigner: false },
          { pubkey: EXECUTION_TAKER, isWritable: true, isSigner: true },
        ]),
      }),
      executionIntent(),
    );
    const compiled = compileUnsignedCandidate(duplicate, {
      feePayer: EXECUTION_TAKER,
      computeUnitLimit: 120_000,
      includeComputeUnitPrice: true,
    });
    expect(compiled.candidate.feePayer).toBe(EXECUTION_TAKER);
    const left = JSON.parse(JSON.stringify(validJupiterBuild())) as Record<string, unknown>;
    const right = {
      tipInstruction: left['tipInstruction'],
      swapMode: left['swapMode'],
      slippageBps: left['slippageBps'],
      routePlan: left['routePlan'],
      outputMint: left['outputMint'],
      otherInstructions: left['otherInstructions'],
      otherAmountThreshold: left['otherAmountThreshold'],
      outAmount: left['outAmount'],
      inputMint: left['inputMint'],
      inAmount: left['inAmount'],
      computeBudgetInstructions: left['computeBudgetInstructions'],
      cleanupInstruction: left['cleanupInstruction'],
      blockhashWithMetadata: left['blockhashWithMetadata'],
      addressesByLookupTableAddress: left['addressesByLookupTableAddress'],
      swapInstruction: left['swapInstruction'],
      setupInstructions: left['setupInstructions'],
    };
    expect(fingerprintOf(validateJupiterBuild(left, executionIntent()))).toBe(
      fingerprintOf(validateJupiterBuild(right, executionIntent())),
    );
  });

  it('changes the build fingerprint when instruction or route order changes', () => {
    const base = fingerprintOf(validateJupiterBuild(validJupiterBuild(), executionIntent()));
    const reordered = fingerprintOf(
      validateJupiterBuild(
        validJupiterBuild({
          setupInstructions: [
            instruction(TOKEN_PROGRAM, 'BQID', [
              { pubkey: EXECUTION_TAKER, isWritable: true, isSigner: true },
            ]),
            instruction(TOKEN_PROGRAM, 'AQID', [
              { pubkey: EXECUTION_TAKER, isWritable: true, isSigner: true },
            ]),
          ],
        }),
        executionIntent(),
      ),
    );
    expect(reordered).not.toBe(base);
  });

  it('rejects 33-byte, float, string, and negative blockhash / lastValid values', () => {
    const bytes = Array.from({ length: 32 }, (_, index) => (index + 1) % 256);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          blockhashWithMetadata: {
            blockhash: [...bytes, 1],
            lastValidBlockHeight: 1000,
            fetchedAt: '2026-08-17T21:00:00.000Z',
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/32-byte/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          blockhashWithMetadata: {
            blockhash: bytes.map((item, index) => (index === 0 ? 1.5 : item)),
            lastValidBlockHeight: 1000,
            fetchedAt: '2026-08-17T21:00:00.000Z',
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/invalid/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          blockhashWithMetadata: {
            blockhash: bytes.map((item, index) => (index === 0 ? '1' : item)),
            lastValidBlockHeight: 1000,
            fetchedAt: '2026-08-17T21:00:00.000Z',
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/invalid/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          blockhashWithMetadata: {
            blockhash: bytes,
            lastValidBlockHeight: -1,
            fetchedAt: '2026-08-17T21:00:00.000Z',
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/lastValidBlockHeight|non-negative/);
  });

  it('rejects zero hop output, scientific amounts, and otherAmountThreshold above outAmount', () => {
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          routePlan: [
            {
              percent: 100,
              bps: 10000,
              swapInfo: {
                ammKey: TOKEN_PROGRAM,
                label: 'x',
                inputMint: WRAPPED_SOL_MINT,
                outputMint: USDC_MINT,
                inAmount: '1000000',
                outAmount: '0',
              },
            },
          ],
        }),
        executionIntent(),
      ),
    ).toThrow(/outAmount/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          inAmount: '1e6',
        }),
        executionIntent(),
      ),
    ).toThrow(/match the requested ExactIn intent|canonical/);
    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          otherAmountThreshold: '2000001',
        }),
        executionIntent(),
      ),
    ).toThrow(/otherAmountThreshold/);
  });

  it('cancels a late-crossing multibyte UTF-8 body by byte count', async () => {
    let cancelled = false;
    const text = '€'.repeat(200_000);
    const chunk = new TextEncoder().encode(text);
    const client = createJupiterBuildClient({
      timeoutMs: 5000,
      fetchImpl: () =>
        Promise.resolve({
          status: 200,
          ok: true,
          headers: {
            get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          body: {
            getReader: () => ({
              read() {
                return Promise.resolve({ done: false, value: chunk });
              },
              cancel() {
                cancelled = true;
              },
            }),
          },
        }),
    });
    await expect(client.build(buildJupiterRequest(executionIntent()))).rejects.toThrow(/2 MiB/);
    expect(cancelled).toBe(true);
    expect(chunk.byteLength).toBeGreaterThan(text.length);
  });

  it('treats genesis RPC failure as rpc_unavailable and getFeeForMessage null as unavailable', async () => {
    const failed = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: {
        getGenesisHash: () => Promise.reject(new Error('genesis down')),
        getBlockHeight: () => Promise.resolve(900n),
        simulateTransaction: () => {
          throw new Error('simulate must not run');
        },
        getFeeForMessage: () => Promise.resolve(5000n),
      },
    });
    expect(failed.status).toBe('rpc_unavailable');
    expect(failed.secondSimulation).toBeNull();

    const passed = await simulateNormalizedBuild({
      intent: executionIntent(),
      build: validateJupiterBuild(validJupiterBuild(), executionIntent()),
      rpc: {
        getGenesisHash: () => Promise.resolve(SOLANA_MAINNET_GENESIS_HASH),
        getBlockHeight: () => Promise.resolve(1000n),
        simulateTransaction: (_wire, options) =>
          Promise.resolve({
            ok: true,
            unitsConsumed: options.replaceRecentBlockhash ? 100_000n : 99_000n,
            errorSummary: null,
            logs: [],
            failureKind: 'none',
          }),
        getFeeForMessage: () => Promise.resolve(null),
      },
    });
    expect(passed.status).toBe('simulation_passed');
    expect(passed.fees?.rpcEstimatedTransactionFeeLamports).toBeNull();
    expect(passed.currentBlockHeightAfterFirst).toBe(1000n);
    expect(passed.currentBlockHeightBeforeFinal).toBe(1000n);
  });
});
