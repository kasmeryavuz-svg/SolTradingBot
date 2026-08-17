import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_DEFINITION_FINGERPRINT,
  canonicalDashboardDefinition,
  fingerprintDashboardDefinition,
  mutateCanonicalDashboardDefinition,
} from '../src/dashboard/index.js';

describe('d13 dashboard definition fingerprint', () => {
  it('derives a stable 64-hex fingerprint from canonical JSON', () => {
    expect(DASHBOARD_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintDashboardDefinition()).toBe(DASHBOARD_DEFINITION_FINGERPRINT);
    expect(fingerprintDashboardDefinition(canonicalDashboardDefinition())).toBe(
      DASHBOARD_DEFINITION_FINGERPRINT,
    );
  });

  it('changes when each frozen semantic contract field is mutated independently', () => {
    const base = DASHBOARD_DEFINITION_FINGERPRINT;
    const mutations: Array<(definition: ReturnType<typeof mutateCanonicalDashboardDefinition>) => void> = [
      (definition) => {
        (definition.hostPolicy as unknown as { bindHost: string }).bindHost = '0.0.0.0';
      },
      (definition) => {
        (definition.httpPolicy as unknown as { allowedMethods: string[] }).allowedMethods = [
          'GET',
          'HEAD',
          'POST',
        ];
      },
      (definition) => {
        (definition.networkPolicy as { thirdPartyHttpApi: boolean }).thirdPartyHttpApi = true;
      },
      (definition) => {
        (definition.routeContract as unknown as { api: string[] }).api = [
          ...definition.routeContract.api,
          '/api/v1/action',
        ];
      },
      (definition) => {
        (definition.securityHeaders as { xFrameOptions: string }).xFrameOptions = 'SAMEORIGIN';
      },
      (definition) => {
        (definition.databasePolicy as { readOnly: boolean }).readOnly = false;
      },
      (definition) => {
        (definition as unknown as { sectionContract: string[] }).sectionContract = [
          ...definition.sectionContract,
          'logs',
        ];
      },
      (definition) => {
        (definition.researchPresentation as { ranking: boolean }).ranking = true;
      },
      (definition) => {
        (definition.mutations as { buy: boolean }).buy = true;
      },
      (definition) => {
        (definition.queryParameterPolicy as { unexpectedQueryParameters: string }).unexpectedQueryParameters =
          'ignore';
      },
      (definition) => {
        (definition.requestTargetPolicy as { rejectAbsoluteForm: boolean }).rejectAbsoluteForm = false;
      },
      (definition) => {
        (definition.refreshBehavior as { staleResponseSuppression: string }).staleResponseSuppression = 'none';
      },
      (definition) => {
        (definition.tradingEnabledRefusal as { presentation: string }).presentation = 'checkpoint_00';
      },
      (definition) => {
        (definition.databaseHealthPolicy as { integrityCheckOnlyOnDatabaseHealthRoute: boolean }).integrityCheckOnlyOnDatabaseHealthRoute =
          false;
      },
      (definition) => {
        (definition.hostHeaderPolicy as { exactParseEquality: boolean }).exactParseEquality = false;
      },
      (definition) => {
        (definition.staticAssetPolicy as { allowlistOnly: boolean }).allowlistOnly = false;
      },
      (definition) => {
        (definition.errorResponseBehavior as { finiteJsonNumbersRequired: boolean }).finiteJsonNumbersRequired =
          false;
      },
    ];

    for (const mutate of mutations) {
      const fingerprint = fingerprintDashboardDefinition(mutateCanonicalDashboardDefinition(mutate));
      expect(fingerprint).not.toBe(base);
      expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
