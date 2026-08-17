import { describe, expect, it } from 'vitest';
import { TOKEN_PROGRAM } from './execution-fixtures.js';
import { compileUnsignedCandidate, validateJupiterBuild } from '../src/execution/index.js';
import { executionIntent, validJupiterBuild } from './execution-fixtures.js';

describe('unsigned v0 transaction compilation', () => {
  it('compiles a version-0 unsigned candidate with the taker as fee payer', () => {
    const build = validateJupiterBuild(validJupiterBuild(), executionIntent());
    const compiled = compileUnsignedCandidate(build, {
      feePayer: executionIntent().takerPublicKey,
      computeUnitLimit: 1_400_000,
      includeComputeUnitPrice: true,
    });
    expect(compiled.candidate.version).toBe(0);
    expect(compiled.candidate.feePayer).toBe(executionIntent().takerPublicKey);
    expect(compiled.candidate.computeUnitLimit).toBe(1_400_000);
    expect(compiled.wireTransactionBase64.length).toBeGreaterThan(0);
    expect(compiled.messageBase64.length).toBeGreaterThan(0);
  });

  it('accepts a valid supplied lookup-table mapping and rejects an invalid table address', () => {
    const valid = validateJupiterBuild(
      validJupiterBuild({
        addressesByLookupTableAddress: {
          [TOKEN_PROGRAM]: [executionIntent().inputMint],
        },
      }),
      executionIntent(),
    );
    expect(valid.lookupTables[TOKEN_PROGRAM]).toEqual([executionIntent().inputMint]);

    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          addressesByLookupTableAddress: {
            'not-a-table': [executionIntent().inputMint],
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/lookup-table address/);

    expect(() =>
      validateJupiterBuild(
        validJupiterBuild({
          addressesByLookupTableAddress: {
            [TOKEN_PROGRAM]: ['not-an-account'],
          },
        }),
        executionIntent(),
      ),
    ).toThrow(/invalid account/);
  });
});
