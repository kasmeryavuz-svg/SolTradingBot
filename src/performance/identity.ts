import { createHash } from 'node:crypto';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../backtest/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import {
  ENTRY_REFERENCE_NOTIONAL_USD,
  FROZEN_C06_V1_FEATURE_SET_VERSION,
  PERFORMANCE_SPEC_NAME,
  PERFORMANCE_SPEC_VERSION,
  REQUIRED_PERFORMANCE_BACKTEST_SPEC_VERSION,
  REQUIRED_PERFORMANCE_EXIT_SPEC_VERSION,
  REQUIRED_PERFORMANCE_FEATURE_SET_VERSION,
  REQUIRED_PERFORMANCE_PAPER_SPEC_VERSION,
  REQUIRED_PERFORMANCE_POSITION_SPEC_VERSION,
  REQUIRED_PERFORMANCE_STRATEGY_VERSION,
} from './constants.js';
import type { CompletedPaperTrade } from './types.js';

/**
 * Canonical a12_v1 definition fingerprint contract.
 *
 * SHA-256 of JSON.stringify(canonicalPerformanceDefinition()) with explicit
 * key order. Portable data only: no function source, file bytes, git SHA,
 * locale, timezone, wall-clock time, or randomness.
 *
 * Changing any frozen semantic below requires a new analytics spec.
 */
export type CanonicalPerformanceDefinition = {
  performanceSpecVersion: string;
  performanceSpecName: string;
  requiredFeatureSetVersion: string;
  requiredStrategyVersion: string;
  requiredStrategyDefinitionFingerprint: string;
  requiredPaperSpecVersion: string;
  requiredPaperDefinitionFingerprint: string;
  requiredPositionSpecVersion: string;
  requiredPositionDefinitionFingerprint: string;
  requiredExitSpecVersion: string;
  requiredExitDefinitionFingerprint: string;
  requiredBacktestSpecVersion: string;
  requiredBacktestDefinitionFingerprint: string;
  source: string;
  eligibility: {
    requirePaperPosition: boolean;
    requirePaperPositionExit: boolean;
    requireClosingExitEvaluation: boolean;
    requireOpeningPaperPositionChain: boolean;
    openPositionsEligible: boolean;
    noChangeEvaluationsEligible: boolean;
    paperEntryWithoutExitEligible: boolean;
    markToMarketOpenPositions: boolean;
    inferExitFromLaterSnapshot: boolean;
    useLatestTokenPrice: boolean;
    fabricateMissingExits: boolean;
  };
  entryValue: {
    priceSource: string;
    notionalSource: string;
    notionalUsd: number;
    quantitySource: string;
    recomputeQuantityFromNotional: boolean;
    validateStoredQuantityAgainstFrozenPm10Formula: boolean;
    pnlUsesStoredQuantityAfterValidation: boolean;
  };
  exitValue: {
    priceSource: string;
    priceIsGuaranteedFill: boolean;
    zeroExitPrice: string;
    quantitySource: string;
  };
  grossExitValueFormula: string;
  grossPnlFormula: string;
  grossReturnFormula: string;
  holdingDurationFormula: string;
  outcomeClassification: {
    win: string;
    loss: string;
    breakeven: string;
    epsilon: string;
    roundBeforeClassify: boolean;
  };
  tradeOrdering: {
    primary: string;
    tieBreaker: string;
    useDbInsertionOrder: boolean;
    randomOrder: boolean;
  };
  aggregateFormulas: {
    summation: string;
    winRate: string;
    lossRate: string;
    breakevenRate: string;
    rateDenominator: string;
    emptyRates: string;
    totalReferenceNotional: string;
    totalReferenceNotionalIsWalletBalance: boolean;
    totalGrossExitValue: string;
    totalGrossPnl: string;
    aggregateGrossReturn: string;
    aggregateGrossReturnLabel: string;
    emptySubgroupMeans: string;
    profitFactor: string;
    profitFactorNoLosses: string;
    profitFactorNoWinnersWithLosses: string;
    payoffRatio: string;
    payoffRatioRequiresWinnerAndLoser: boolean;
  };
  drawdown: {
    metricName: string;
    model: string;
    startingCumulative: number;
    startingPeak: number;
    portfolioDrawdown: boolean;
    equityDrawdown: boolean;
    drawdownPercentage: boolean;
    runningSummation: string;
  };
  concentration: {
    denominator: string;
    top1: string;
    top3: string;
    emptyPositivePnl: string;
    excludingTopWinnersRemoves: string;
    fewerThanNWinners: string;
    equalWinnerTieBreaker: string;
  };
  exitReasonGrouping: {
    includedReasons: readonly string[];
    rejectedReasons: readonly string[];
    missingCategoryRepresentation: string;
  };
  domainRounding: string;
  fees: string;
  slippage: string;
  priceImpact: string;
  networkPriorityFees: string;
  mevModeling: string;
  failedTransactionModeling: string;
  partialFillModeling: string;
  liveCapitalEquityModel: string;
  compounding: string;
  annualization: string;
  sharpe: string;
  sortino: string;
  portfolioDrawdownPercentage: string;
  unrealizedPnl: string;
  persistence: string;
  databaseAccess: string;
  cherryPicking: string;
  integrity: {
    recomputeOpeningPaperSourceIdentity: boolean;
    recomputePositionEntrySourceIdentity: boolean;
    recomputePositionEvaluationSourceIdentity: boolean;
    recomputeMarketSourceIdentity: boolean;
    recomputeExitEvaluationSourceIdentity: boolean;
    recomputeExitEvidenceSourceIdentity: boolean;
    bindEntryPriceToOpeningPaperAndPositionEvaluation: boolean;
    bindExitPriceToMarketSnapshot: boolean;
    openingRequiresNoPriorOpenPosition: boolean;
    openingPaperAction: string;
    openingStrategyDecision: string;
    positionEvaluationAction: string;
    exitAction: string;
    x11TimestampEquality: string;
    pm10OpenedAtEqualsPaperEvaluatedAt: boolean;
    canonicalUtcIsoTimestamps: boolean;
    rejectClosedPositionStillCurrentOpen: boolean;
    failEntireReportOnAnyCorruptCompletedTrade: boolean;
  };
  numericDomain: {
    signedZero: string;
    signedZeroIsRounding: boolean;
  };
  readConsistency: string;
  schemaCompatibility: string;
  displayLimitAffectsAggregates: boolean;
};

export type CanonicalPerformanceDefinitionOverrides = {
  performanceSpecVersion?: string;
  performanceSpecName?: string;
  requiredFeatureSetVersion?: string;
  requiredStrategyVersion?: string;
  requiredStrategyDefinitionFingerprint?: string;
  requiredPaperSpecVersion?: string;
  requiredPaperDefinitionFingerprint?: string;
  requiredPositionSpecVersion?: string;
  requiredPositionDefinitionFingerprint?: string;
  requiredExitSpecVersion?: string;
  requiredExitDefinitionFingerprint?: string;
  requiredBacktestSpecVersion?: string;
  requiredBacktestDefinitionFingerprint?: string;
  source?: string;
  eligibility?: Partial<CanonicalPerformanceDefinition['eligibility']>;
  entryValue?: Partial<CanonicalPerformanceDefinition['entryValue']>;
  exitValue?: Partial<CanonicalPerformanceDefinition['exitValue']>;
  grossExitValueFormula?: string;
  grossPnlFormula?: string;
  grossReturnFormula?: string;
  holdingDurationFormula?: string;
  outcomeClassification?: Partial<CanonicalPerformanceDefinition['outcomeClassification']>;
  tradeOrdering?: Partial<CanonicalPerformanceDefinition['tradeOrdering']>;
  aggregateFormulas?: Partial<CanonicalPerformanceDefinition['aggregateFormulas']>;
  drawdown?: Partial<CanonicalPerformanceDefinition['drawdown']>;
  concentration?: Partial<CanonicalPerformanceDefinition['concentration']>;
  exitReasonGrouping?: Partial<CanonicalPerformanceDefinition['exitReasonGrouping']>;
  domainRounding?: string;
  fees?: string;
  slippage?: string;
  priceImpact?: string;
  networkPriorityFees?: string;
  mevModeling?: string;
  failedTransactionModeling?: string;
  partialFillModeling?: string;
  liveCapitalEquityModel?: string;
  compounding?: string;
  annualization?: string;
  sharpe?: string;
  sortino?: string;
  portfolioDrawdownPercentage?: string;
  unrealizedPnl?: string;
  persistence?: string;
  databaseAccess?: string;
  cherryPicking?: string;
  integrity?: Partial<CanonicalPerformanceDefinition['integrity']>;
  numericDomain?: Partial<CanonicalPerformanceDefinition['numericDomain']>;
  readConsistency?: string;
  schemaCompatibility?: string;
  displayLimitAffectsAggregates?: boolean;
};

export function canonicalPerformanceDefinition(
  overrides: CanonicalPerformanceDefinitionOverrides = {},
): CanonicalPerformanceDefinition {
  return {
    performanceSpecVersion: overrides.performanceSpecVersion ?? PERFORMANCE_SPEC_VERSION,
    performanceSpecName: overrides.performanceSpecName ?? PERFORMANCE_SPEC_NAME,
    requiredFeatureSetVersion:
      overrides.requiredFeatureSetVersion ?? REQUIRED_PERFORMANCE_FEATURE_SET_VERSION,
    requiredStrategyVersion:
      overrides.requiredStrategyVersion ?? REQUIRED_PERFORMANCE_STRATEGY_VERSION,
    requiredStrategyDefinitionFingerprint:
      overrides.requiredStrategyDefinitionFingerprint ?? STRATEGY_DEFINITION_FINGERPRINT,
    requiredPaperSpecVersion:
      overrides.requiredPaperSpecVersion ?? REQUIRED_PERFORMANCE_PAPER_SPEC_VERSION,
    requiredPaperDefinitionFingerprint:
      overrides.requiredPaperDefinitionFingerprint ?? PAPER_DEFINITION_FINGERPRINT,
    requiredPositionSpecVersion:
      overrides.requiredPositionSpecVersion ?? REQUIRED_PERFORMANCE_POSITION_SPEC_VERSION,
    requiredPositionDefinitionFingerprint:
      overrides.requiredPositionDefinitionFingerprint ?? POSITION_DEFINITION_FINGERPRINT,
    requiredExitSpecVersion:
      overrides.requiredExitSpecVersion ?? REQUIRED_PERFORMANCE_EXIT_SPEC_VERSION,
    requiredExitDefinitionFingerprint:
      overrides.requiredExitDefinitionFingerprint ?? EXIT_DEFINITION_FINGERPRINT,
    requiredBacktestSpecVersion:
      overrides.requiredBacktestSpecVersion ?? REQUIRED_PERFORMANCE_BACKTEST_SPEC_VERSION,
    requiredBacktestDefinitionFingerprint:
      overrides.requiredBacktestDefinitionFingerprint ?? BACKTEST_DEFINITION_FINGERPRINT,
    source: overrides.source ?? 'immutable_completed_paper_positions_only',
    eligibility: {
      requirePaperPosition: overrides.eligibility?.requirePaperPosition ?? true,
      requirePaperPositionExit: overrides.eligibility?.requirePaperPositionExit ?? true,
      requireClosingExitEvaluation: overrides.eligibility?.requireClosingExitEvaluation ?? true,
      requireOpeningPaperPositionChain:
        overrides.eligibility?.requireOpeningPaperPositionChain ?? true,
      openPositionsEligible: overrides.eligibility?.openPositionsEligible ?? false,
      noChangeEvaluationsEligible: overrides.eligibility?.noChangeEvaluationsEligible ?? false,
      paperEntryWithoutExitEligible: overrides.eligibility?.paperEntryWithoutExitEligible ?? false,
      markToMarketOpenPositions: overrides.eligibility?.markToMarketOpenPositions ?? false,
      inferExitFromLaterSnapshot: overrides.eligibility?.inferExitFromLaterSnapshot ?? false,
      useLatestTokenPrice: overrides.eligibility?.useLatestTokenPrice ?? false,
      fabricateMissingExits: overrides.eligibility?.fabricateMissingExits ?? false,
    },
    entryValue: {
      priceSource: overrides.entryValue?.priceSource ?? 'immutable_paper_positions.entry_price_usd',
      notionalSource:
        overrides.entryValue?.notionalSource ?? 'immutable_paper_positions.entry_notional_usd',
      notionalUsd: overrides.entryValue?.notionalUsd ?? ENTRY_REFERENCE_NOTIONAL_USD,
      quantitySource:
        overrides.entryValue?.quantitySource ?? 'immutable_paper_positions.quantity_tokens',
      recomputeQuantityFromNotional: overrides.entryValue?.recomputeQuantityFromNotional ?? false,
      validateStoredQuantityAgainstFrozenPm10Formula:
        overrides.entryValue?.validateStoredQuantityAgainstFrozenPm10Formula ?? true,
      pnlUsesStoredQuantityAfterValidation:
        overrides.entryValue?.pnlUsesStoredQuantityAfterValidation ?? true,
    },
    exitValue: {
      priceSource:
        overrides.exitValue?.priceSource ?? 'immutable_paper_position_exits.exit_price_usd',
      priceIsGuaranteedFill: overrides.exitValue?.priceIsGuaranteedFill ?? false,
      zeroExitPrice: overrides.exitValue?.zeroExitPrice ?? 'valid_total_gross_loss',
      quantitySource:
        overrides.exitValue?.quantitySource ??
        'immutable_exit_quantity_must_exactly_equal_position_quantity',
    },
    grossExitValueFormula: overrides.grossExitValueFormula ?? 'quantityTokens * exitPriceUsd',
    grossPnlFormula: overrides.grossPnlFormula ?? 'grossExitValueUsd - entryReferenceNotionalUsd',
    grossReturnFormula:
      overrides.grossReturnFormula ?? '((exitPriceUsd / entryPriceUsd) - 1) * 100',
    holdingDurationFormula: overrides.holdingDurationFormula ?? 'exitedAt - openedAt',
    outcomeClassification: {
      win: overrides.outcomeClassification?.win ?? 'grossPnlUsd > 0',
      loss: overrides.outcomeClassification?.loss ?? 'grossPnlUsd < 0',
      breakeven: overrides.outcomeClassification?.breakeven ?? 'grossPnlUsd === 0',
      epsilon: overrides.outcomeClassification?.epsilon ?? 'none',
      roundBeforeClassify: overrides.outcomeClassification?.roundBeforeClassify ?? false,
    },
    tradeOrdering: {
      primary: overrides.tradeOrdering?.primary ?? 'exitedAt_ascending',
      tieBreaker:
        overrides.tradeOrdering?.tieBreaker ??
        'positionSourceIdentity_then_exitEvidenceSourceIdentity_then_exitEvaluationSourceIdentity',
      useDbInsertionOrder: overrides.tradeOrdering?.useDbInsertionOrder ?? false,
      randomOrder: overrides.tradeOrdering?.randomOrder ?? false,
    },
    aggregateFormulas: {
      summation: overrides.aggregateFormulas?.summation ?? 'neumaier_compensated_summation',
      winRate: overrides.aggregateFormulas?.winRate ?? 'winCount / closedTradeCount * 100',
      lossRate: overrides.aggregateFormulas?.lossRate ?? 'lossCount / closedTradeCount * 100',
      breakevenRate:
        overrides.aggregateFormulas?.breakevenRate ?? 'breakevenCount / closedTradeCount * 100',
      rateDenominator: overrides.aggregateFormulas?.rateDenominator ?? 'closed_trade_count',
      emptyRates: overrides.aggregateFormulas?.emptyRates ?? 'null',
      totalReferenceNotional:
        overrides.aggregateFormulas?.totalReferenceNotional ??
        'sum_of_each_trade_entryReferenceNotionalUsd',
      totalReferenceNotionalIsWalletBalance:
        overrides.aggregateFormulas?.totalReferenceNotionalIsWalletBalance ?? false,
      totalGrossExitValue:
        overrides.aggregateFormulas?.totalGrossExitValue ?? 'sum_of_grossExitValueUsd',
      totalGrossPnl: overrides.aggregateFormulas?.totalGrossPnl ?? 'sum_of_grossPnlUsd',
      aggregateGrossReturn:
        overrides.aggregateFormulas?.aggregateGrossReturn ??
        'totalGrossPnlUsd / totalReferenceNotionalUsd * 100',
      aggregateGrossReturnLabel:
        overrides.aggregateFormulas?.aggregateGrossReturnLabel ??
        'aggregate gross return on summed trade reference notional',
      emptySubgroupMeans: overrides.aggregateFormulas?.emptySubgroupMeans ?? 'null',
      profitFactor:
        overrides.aggregateFormulas?.profitFactor ??
        'totalPositiveGrossPnlUsd / abs(totalNegativeGrossPnlUsd)',
      profitFactorNoLosses: overrides.aggregateFormulas?.profitFactorNoLosses ?? 'null',
      profitFactorNoWinnersWithLosses:
        overrides.aggregateFormulas?.profitFactorNoWinnersWithLosses ?? '0',
      payoffRatio:
        overrides.aggregateFormulas?.payoffRatio ??
        'meanWinningGrossPnlUsd / abs(meanLosingGrossPnlUsd)',
      payoffRatioRequiresWinnerAndLoser:
        overrides.aggregateFormulas?.payoffRatioRequiresWinnerAndLoser ?? true,
    },
    drawdown: {
      metricName: overrides.drawdown?.metricName ?? 'maxClosedTradeCumulativePnlDrawdownUsd',
      model: overrides.drawdown?.model ?? 'closed_trade_cumulative_gross_pnl_peak_to_current',
      startingCumulative: overrides.drawdown?.startingCumulative ?? 0,
      startingPeak: overrides.drawdown?.startingPeak ?? 0,
      portfolioDrawdown: overrides.drawdown?.portfolioDrawdown ?? false,
      equityDrawdown: overrides.drawdown?.equityDrawdown ?? false,
      drawdownPercentage: overrides.drawdown?.drawdownPercentage ?? false,
      runningSummation: overrides.drawdown?.runningSummation ?? 'neumaier_compensated_summation',
    },
    concentration: {
      denominator: overrides.concentration?.denominator ?? 'total_positive_gross_pnl',
      top1:
        overrides.concentration?.top1 ??
        'largest_positive_trade_pnl / totalPositiveGrossPnlUsd * 100',
      top3:
        overrides.concentration?.top3 ??
        'sum_of_largest_up_to_3_positive_trade_pnls / totalPositiveGrossPnlUsd * 100',
      emptyPositivePnl: overrides.concentration?.emptyPositivePnl ?? 'null',
      excludingTopWinnersRemoves:
        overrides.concentration?.excludingTopWinnersRemoves ?? 'winners_only',
      fewerThanNWinners:
        overrides.concentration?.fewerThanNWinners ?? 'remove_however_many_winners_exist',
      equalWinnerTieBreaker:
        overrides.concentration?.equalWinnerTieBreaker ??
        'immutable_trade_identity_after_pnl_descending',
    },
    exitReasonGrouping: {
      includedReasons: overrides.exitReasonGrouping?.includedReasons ?? [
        'stop_loss_threshold',
        'take_profit_threshold',
        'max_holding_time',
      ],
      rejectedReasons: overrides.exitReasonGrouping?.rejectedReasons ?? [
        'market_price_unavailable',
        'exit_conditions_not_met',
      ],
      missingCategoryRepresentation:
        overrides.exitReasonGrouping?.missingCategoryRepresentation ??
        'present_with_count_0_and_null_means',
    },
    domainRounding: overrides.domainRounding ?? 'none',
    fees: overrides.fees ?? 'none',
    slippage: overrides.slippage ?? 'none',
    priceImpact: overrides.priceImpact ?? 'none',
    networkPriorityFees: overrides.networkPriorityFees ?? 'none',
    mevModeling: overrides.mevModeling ?? 'none',
    failedTransactionModeling: overrides.failedTransactionModeling ?? 'none',
    partialFillModeling: overrides.partialFillModeling ?? 'none',
    liveCapitalEquityModel: overrides.liveCapitalEquityModel ?? 'none',
    compounding: overrides.compounding ?? 'none',
    annualization: overrides.annualization ?? 'none',
    sharpe: overrides.sharpe ?? 'none',
    sortino: overrides.sortino ?? 'none',
    portfolioDrawdownPercentage: overrides.portfolioDrawdownPercentage ?? 'none',
    unrealizedPnl: overrides.unrealizedPnl ?? 'none',
    persistence: overrides.persistence ?? 'none_recomputed_from_immutable_stored_data',
    databaseAccess: overrides.databaseAccess ?? 'read_only_query_only',
    cherryPicking: overrides.cherryPicking ?? 'none_all_eligible_closed_trades',
    integrity: {
      recomputeOpeningPaperSourceIdentity:
        overrides.integrity?.recomputeOpeningPaperSourceIdentity ?? true,
      recomputePositionEntrySourceIdentity:
        overrides.integrity?.recomputePositionEntrySourceIdentity ?? true,
      recomputePositionEvaluationSourceIdentity:
        overrides.integrity?.recomputePositionEvaluationSourceIdentity ?? true,
      recomputeMarketSourceIdentity: overrides.integrity?.recomputeMarketSourceIdentity ?? true,
      recomputeExitEvaluationSourceIdentity:
        overrides.integrity?.recomputeExitEvaluationSourceIdentity ?? true,
      recomputeExitEvidenceSourceIdentity:
        overrides.integrity?.recomputeExitEvidenceSourceIdentity ?? true,
      bindEntryPriceToOpeningPaperAndPositionEvaluation:
        overrides.integrity?.bindEntryPriceToOpeningPaperAndPositionEvaluation ?? true,
      bindExitPriceToMarketSnapshot: overrides.integrity?.bindExitPriceToMarketSnapshot ?? true,
      openingRequiresNoPriorOpenPosition:
        overrides.integrity?.openingRequiresNoPriorOpenPosition ?? true,
      openingPaperAction: overrides.integrity?.openingPaperAction ?? 'entry_observation',
      openingStrategyDecision: overrides.integrity?.openingStrategyDecision ?? 'entry_candidate',
      positionEvaluationAction: overrides.integrity?.positionEvaluationAction ?? 'open_position',
      exitAction: overrides.integrity?.exitAction ?? 'close_position',
      x11TimestampEquality:
        overrides.integrity?.x11TimestampEquality ??
        'exitedAt_equals_exitMarketCollectedAt_equals_asOf_equals_evaluatedAt_equals_snapshotCollectedAt',
      pm10OpenedAtEqualsPaperEvaluatedAt:
        overrides.integrity?.pm10OpenedAtEqualsPaperEvaluatedAt ?? true,
      canonicalUtcIsoTimestamps: overrides.integrity?.canonicalUtcIsoTimestamps ?? true,
      rejectClosedPositionStillCurrentOpen:
        overrides.integrity?.rejectClosedPositionStillCurrentOpen ?? true,
      failEntireReportOnAnyCorruptCompletedTrade:
        overrides.integrity?.failEntireReportOnAnyCorruptCompletedTrade ?? true,
    },
    numericDomain: {
      signedZero: overrides.numericDomain?.signedZero ?? 'canonicalize_to_positive_zero',
      signedZeroIsRounding: overrides.numericDomain?.signedZeroIsRounding ?? false,
    },
    readConsistency:
      overrides.readConsistency ?? 'sqlite_deferred_read_transaction_snapshot',
    schemaCompatibility:
      overrides.schemaCompatibility ?? 'required_tables_and_columns_not_version_floor_only',
    displayLimitAffectsAggregates: overrides.displayLimitAffectsAggregates ?? false,
  };
}

export function mutateCanonicalPerformanceDefinition(
  mutate: (definition: CanonicalPerformanceDefinition) => void,
): CanonicalPerformanceDefinition {
  const definition = structuredClone(canonicalPerformanceDefinition());
  mutate(definition);
  return definition;
}

export function fingerprintPerformanceDefinition(
  definition: CanonicalPerformanceDefinition = canonicalPerformanceDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const PERFORMANCE_DEFINITION_FINGERPRINT = fingerprintPerformanceDefinition();

const frozenFeatureSet: string = canonicalPerformanceDefinition().requiredFeatureSetVersion;
if (frozenFeatureSet !== FROZEN_C06_V1_FEATURE_SET_VERSION) {
  throw new Error('a12_v1 canonical definition must freeze feature set c06_v1.');
}

export function fingerprintPerformanceDataset(input: {
  performanceSpecVersion: string;
  performanceDefinitionFingerprint: string;
  trades: readonly Pick<
    CompletedPaperTrade,
    'positionSourceIdentity' | 'exitEvidenceSourceIdentity' | 'exitEvaluationSourceIdentity'
  >[];
}): string {
  const canonical = {
    performanceSpecVersion: input.performanceSpecVersion,
    performanceDefinitionFingerprint: input.performanceDefinitionFingerprint,
    trades: input.trades.map((trade) => ({
      positionSourceIdentity: trade.positionSourceIdentity,
      exitEvidenceSourceIdentity: trade.exitEvidenceSourceIdentity,
      exitEvaluationSourceIdentity: trade.exitEvaluationSourceIdentity,
    })),
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}
