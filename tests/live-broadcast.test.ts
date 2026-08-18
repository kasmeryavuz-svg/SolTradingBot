import { afterEach, describe, expect, it } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { LIVE_SPEC_VERSION } from '../src/live/constants.js';
import { executeLiveBroadcast } from '../src/live/execute.js';
import { executeLivePreview } from '../src/live/preview.js';
import { LiveError } from '../src/live/errors.js';
import { LIVE_DEFINITION_FINGERPRINT, liveAttemptId } from '../src/live/identity.js';
import {
  createFakeLiveRpc,
  dummyCanonicalSignature,
  instantClock,
  liveExecutionRpc,
  liveJupiter,
  openMemoryLiveStore,
} from './live-fixtures.js';
import { loadTestWalletFixture, walletExecutionIntent } from './wallet-fixtures.js';

const opened: Array<{ close: () => void }> = [];

afterEach(() => {
  while (opened.length > 0) {
    opened.pop()?.close();
  }
});

async function fakeExecute(
  overrides: {
    sendBehavior?: 'ok' | 'timeout' | 'mismatch' | 'reject';
    confirm?: (phrase: string) => Promise<void>;
    secret?: string;
    amountRaw?: string;
    outputMint?: string;
    height?: bigint;
    heightBeforeSend?: bigint;
    balanceLamports?: bigint;
    initialStatus?: 'confirmed' | 'none';
    mismatchSignature?: string;
  } = {},
) {
  const fixture = await loadTestWalletFixture();
  const memory = openMemoryLiveStore();
  opened.push(memory);
  const liveRpc = createFakeLiveRpc({
    takerAddress: fixture.address,
    sendBehavior: overrides.sendBehavior ?? 'ok',
    height: overrides.height ?? 900n,
    balanceLamports: overrides.balanceLamports ?? 20_000_000n,
    ...(overrides.mismatchSignature === undefined
      ? {}
      : { mismatchSignature: overrides.mismatchSignature }),
    initialStatus:
      overrides.initialStatus === 'none'
        ? null
        : { slot: '123', err: null, confirmationStatus: 'confirmed' },
  });
  if (overrides.heightBeforeSend !== undefined) {
    const original = liveRpc.getBlockHeight.bind(liveRpc);
    let calls = 0;
    liveRpc.getBlockHeight = () => {
      calls += 1;
      if (calls > 1) {
        liveRpc.setHeight(overrides.heightBeforeSend ?? 900n);
      }
      return original();
    };
  }
  const counters = { secret: 0, sign: 0, send: 0 };
  const intent = walletExecutionIntent(fixture.address);
  const report = await executeLiveBroadcast({
    intent: {
      ...intent,
      amountRaw: overrides.amountRaw ?? intent.amountRaw,
      outputMint: overrides.outputMint ?? intent.outputMint,
    },
    jupiter: liveJupiter(fixture.address),
    executionRpc: liveExecutionRpc(),
    liveRpc,
    store: memory.store,
    promptSecret: () => {
      counters.secret += 1;
      return Promise.resolve(overrides.secret ?? fixture.secretBase58);
    },
    promptConfirmation: overrides.confirm ?? (() => Promise.resolve()),
    clock: instantClock(),
    onSign: () => {
      counters.sign += 1;
    },
    onSend: () => {
      counters.send += 1;
    },
  });
  return { report, liveRpc, counters, fixture, store: memory.store };
}

describe('live broadcast', () => {
  it('sends exactly once on the successful fake path and verifies the receipt', async () => {
    const { report, liveRpc, counters, fixture, store } = await fakeExecute();
    expect(liveRpc.sendCount).toBe(1);
    expect(counters.send).toBe(1);
    expect(report.status === 'confirmed' || report.status === 'finalized').toBe(true);
    expect(report.expectedSignature).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
    expect(report.actualOutputRaw).toBe('1980000');
    expect(report.sendCount).toBe(1);
    const row = store.getById(report.attemptId);
    expect(JSON.stringify(row)).not.toContain(fixture.secretBase58);
    expect(JSON.stringify(row)).not.toContain(liveRpc.acceptedWires[0]);
  });

  it('does not prompt, sign, or send when confirmation is cancelled', async () => {
    const fixture = await loadTestWalletFixture();
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
    await expect(
      executeLiveBroadcast({
        intent: walletExecutionIntent(fixture.address),
        jupiter: liveJupiter(fixture.address),
        executionRpc: liveExecutionRpc(),
        liveRpc,
        store: memory.store,
        promptSecret: () => Promise.resolve(fixture.secretBase58),
        promptConfirmation: () =>
          Promise.reject(new LiveError('cancelled', { code: 'confirmation_cancelled' })),
      }),
    ).rejects.toThrow(/cancelled/);
    expect(liveRpc.sendCount).toBe(0);
    expect(memory.store.listRecent(10)).toHaveLength(0);
  });

  it('keeps send at 0 for amount over cap, wrong pair, low balance, and stale headroom', async () => {
    await expect(fakeExecute({ amountRaw: '1000001' })).rejects.toThrow(/1_000_000|1000000/);
    await expect(fakeExecute({ outputMint: WRAPPED_SOL_MINT })).rejects.toThrow(/unsupported_live_pair|WSOL/);
    await expect(fakeExecute({ balanceLamports: 1_000n })).rejects.toThrow(/balance/);
    await expect(fakeExecute({ height: 990n })).rejects.toThrow(/headroom|stale/);
  });

  it('treats a send timeout as unknown, then confirms the expected txid without a second send', async () => {
    const fixture = await loadTestWalletFixture();
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const liveRpc = createFakeLiveRpc({
      takerAddress: fixture.address,
      sendBehavior: 'timeout',
      initialStatus: { slot: '123', err: null, confirmationStatus: 'confirmed' },
    });
    const report = await executeLiveBroadcast({
      intent: walletExecutionIntent(fixture.address),
      jupiter: liveJupiter(fixture.address),
      executionRpc: liveExecutionRpc(),
      liveRpc,
      store: memory.store,
      promptSecret: () => Promise.resolve(fixture.secretBase58),
      promptConfirmation: () => Promise.resolve(),
      clock: instantClock(),
    });
    expect(liveRpc.sendCount).toBe(1);
    expect(report.status === 'confirmed' || report.status === 'broadcast_outcome_unknown').toBe(true);
    if (report.status === 'confirmed') {
      expect(report.expectedSignature).toBeTruthy();
    }
  });

  it('expires unresolved after a send throw when the signature never appears', async () => {
    const fixture = await loadTestWalletFixture();
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const liveRpc = createFakeLiveRpc({
      takerAddress: fixture.address,
      sendBehavior: 'timeout',
      height: 900n,
      expireAfterSend: true,
      expireHeight: 1001n,
      initialStatus: null,
    });
    const report = await executeLiveBroadcast({
      intent: walletExecutionIntent(fixture.address),
      jupiter: liveJupiter(fixture.address),
      executionRpc: liveExecutionRpc(),
      liveRpc,
      store: memory.store,
      promptSecret: () => Promise.resolve(fixture.secretBase58),
      promptConfirmation: () => Promise.resolve(),
      clock: instantClock(),
    });
    expect(liveRpc.sendCount).toBe(1);
    expect(report.status).toBe('expired_unconfirmed');
  });

  it('does not trust a mismatched RPC signature and still polls expected without resending', async () => {
    const { report, liveRpc } = await fakeExecute({
      sendBehavior: 'mismatch',
      mismatchSignature: dummyCanonicalSignature(3),
    });
    expect(liveRpc.sendCount).toBe(1);
    expect(report.rpcReturnedSignature).toBe(dummyCanonicalSignature(3));
    expect(report.expectedSignature).not.toBe(report.rpcReturnedSignature);
    expect(report.failureCode === 'rpc_signature_mismatch' || report.status === 'confirmed').toBe(true);
  });

  it('refuses a second reservation of the same candidate with send 0', async () => {
    const first = await fakeExecute();
    expect(first.liveRpc.sendCount).toBe(1);
    const fixture = first.fixture;
    const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
    await expect(
      executeLiveBroadcast({
        intent: walletExecutionIntent(fixture.address),
        jupiter: liveJupiter(fixture.address),
        executionRpc: liveExecutionRpc(),
        liveRpc,
        store: first.store,
        promptSecret: () => Promise.resolve(fixture.secretBase58),
        promptConfirmation: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/duplicate_live_candidate/);
    expect(liveRpc.sendCount).toBe(0);
  });

  it('keeps send at 0 for genesis mismatch, simulation fail, missing fee, and fee over cap', async () => {
    const fixture = await loadTestWalletFixture();
    const cases = [
      {
        name: 'genesis',
        rpc: liveExecutionRpc({ getGenesisHash: () => Promise.resolve('wrong-genesis-hash-not-mainnet') }),
        match: /genesis|unsupported_network|mainnet/,
      },
      {
        name: 'simulation',
        rpc: liveExecutionRpc({
          simulateTransaction: () =>
            Promise.resolve({
              ok: false,
              unitsConsumed: 1n,
              errorSummary: 'failed',
              logs: [],
              failureKind: 'program_error',
            }),
        }),
        match: /simulation|preflight/,
      },
      {
        name: 'fee missing',
        rpc: liveExecutionRpc({ getFeeForMessage: () => Promise.resolve(null) }),
        match: /unavailable|fee/,
      },
      {
        name: 'fee over cap',
        rpc: liveExecutionRpc({ getFeeForMessage: () => Promise.resolve(100_001n) }),
        match: /fee estimate|100000|over cap/,
      },
    ] as const;

    for (const testCase of cases) {
      const memory = openMemoryLiveStore();
      opened.push(memory);
      const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
      await expect(
        executeLiveBroadcast({
          intent: walletExecutionIntent(fixture.address),
          jupiter: liveJupiter(fixture.address),
          executionRpc: testCase.rpc,
          liveRpc,
          store: memory.store,
          promptSecret: () => Promise.resolve(fixture.secretBase58),
          promptConfirmation: () => Promise.resolve(),
        }),
      ).rejects.toThrow(testCase.match);
      expect(liveRpc.sendCount, testCase.name).toBe(0);
    }
  });

  it('keeps send at 0 when the UTC daily input cap would be exceeded', async () => {
    const fixture = await loadTestWalletFixture();
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const previous = '9'.repeat(64);
    memory.store.reserve({
      attemptId: liveAttemptId(previous),
      liveSpecVersion: LIVE_SPEC_VERSION,
      liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
      createdAtMs: Date.now(),
      takerAddress: fixture.address,
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amountRaw: '1500000',
      executionDefinitionFingerprint: '6c9bf5bd42a6137b21b8ed2f4c8939085c7b999add2013efbf7d63a8fc306fd0',
      executionIntentFingerprint: 'b'.repeat(64),
      jupiterBuildFingerprint: 'c'.repeat(64),
      executionCandidateFingerprint: previous,
      compiledMessageSha256: 'd'.repeat(64),
      walletDefinitionFingerprint: null,
      walletSignerFingerprint: null,
      walletSigningProofFingerprint: null,
      status: 'broadcast_submitted',
      expectedSignature: 'Prev111111111111111111111111111111111111111111111111111111111',
      rpcReturnedSignature: null,
      lastValidBlockHeight: '1000',
      submittedAtMs: Date.now(),
      confirmedAtMs: null,
      confirmationStatus: null,
      slot: null,
      signedWireSha256: null,
      broadcastRiskAtMs: Date.now(),
      rpcEstimatedTransactionFeeLamports: '5000',
      actualTransactionFeeLamports: null,
      actualOutputRaw: null,
      failureCode: null,
      failureMessage: null,
      liveAttemptFingerprint: 'e'.repeat(64),
    });
    const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
    await expect(
      executeLiveBroadcast({
        intent: walletExecutionIntent(fixture.address),
        jupiter: liveJupiter(fixture.address),
        executionRpc: liveExecutionRpc(),
        liveRpc,
        store: memory.store,
        promptSecret: () => Promise.resolve(fixture.secretBase58),
        promptConfirmation: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/2000000|2_000_000|UTC day/);
    expect(liveRpc.sendCount).toBe(0);
  });

  it('keeps send at 0 on signer mismatch after confirmation', async () => {
    const fixture = await loadTestWalletFixture();
    const other = await loadTestWalletFixture('other');
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
    await expect(
      executeLiveBroadcast({
        intent: walletExecutionIntent(fixture.address),
        jupiter: liveJupiter(fixture.address),
        executionRpc: liveExecutionRpc(),
        liveRpc,
        store: memory.store,
        promptSecret: () => Promise.resolve(other.secretBase58),
        promptConfirmation: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/does not match EXECUTION_TAKER_PUBKEY/);
    expect(liveRpc.sendCount).toBe(0);
    expect(memory.store.listRecent(1)[0]?.status).toBe('signer_mismatch');
  });

  it('preview never signs or sends', async () => {
    const fixture = await loadTestWalletFixture();
    const liveRpc = createFakeLiveRpc({ takerAddress: fixture.address });
    const preview = await executeLivePreview({
      intent: walletExecutionIntent(fixture.address),
      jupiter: liveJupiter(fixture.address),
      executionRpc: liveExecutionRpc(),
      liveRpc,
      network: 'mainnet-beta',
    });
    expect(preview.previewOnly).toBe(true);
    expect(preview.noSign).toBe(true);
    expect(preview.noSend).toBe(true);
    expect(liveRpc.sendCount).toBe(0);
    expect(preview.message).toContain('PREVIEW ONLY');
  });
});
