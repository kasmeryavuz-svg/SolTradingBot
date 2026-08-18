import type { RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { FoldBoundaries, OptimizationDataset, ScenarioMetrics } from '../optimization/types.js';
import type { ChronologicalSegment } from '../optimization/types.js';

export const ML_PROMOTION_STATUSES = [
  'NO_MODEL_PROMOTION_INSUFFICIENT_DATA',
  'NO_MODEL_PROMOTION_FAILED_VALIDATION',
  'ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION',
] as const;

export const ML_GATE_RESULTS = ['PASS', 'FAIL', 'NOT_ENOUGH_DATA', 'NOT_COMPARABLE', 'NOT_EVALUABLE'] as const;

export const ML_LABEL_STATES = ['POSITIVE', 'NON_POSITIVE', 'CENSORED'] as const;

export const ML_CENSOR_REASONS = [
  'unresolved_no_closing_observation',
  'outcome_requires_next_segment',
  'label_window_not_contained',
] as const;

export type MlPromotionStatus = (typeof ML_PROMOTION_STATUSES)[number];
export type MlGateResult = (typeof ML_GATE_RESULTS)[number];
export type MlLabelState = (typeof ML_LABEL_STATES)[number];
export type MlCensorReason = (typeof ML_CENSOR_REASONS)[number];
export type MlBinaryLabel = 0 | 1;

export type RawFeatureObservation = {
  name: string;
  kind: 'number' | 'integer' | 'boolean';
  status: 'available' | 'unavailable';
  numericValue: number | null;
  booleanValue: boolean | null;
};

export type MlLabelOutcome = {
  state: MlLabelState;
  label: MlBinaryLabel | null;
  censorReason: MlCensorReason | null;
  completedAt: string | null;
  completedAtMs: number | null;
  exitReason: 'stop_loss_threshold' | 'take_profit_threshold' | 'max_holding_time' | null;
  grossExitReferenceUsd: number | null;
  observedExitPriceUsd: number | null;
  grossPnlUsd: number | null;
  netBasePnlUsd: number | null;
  netStressPnlUsd: number | null;
  netLowPnlUsd: number | null;
  holdingDurationMs: number | null;
  quantityTokens: number | null;
};

export type MlDecisionSample = {
  sampleIdentity: string;
  tokenMint: string;
  pairAddress: string;
  collectedAt: string;
  collectedAtMs: number;
  entryPriceUsd: number;
  rawFeatures: readonly RawFeatureObservation[];
  datasetLabel: MlLabelOutcome;
};

export type WalletIntelligenceReadiness = {
  scanCount: number;
  earliestScanStartedAtMs: number | null;
  latestScanStartedAtMs: number | null;
  marketSamplesSafelyPointInTimeAlignable: number;
  usedAsModelInput: false;
  reason: string;
};

export type MlDataset = {
  mlDefinitionFingerprint: string;
  mlDatasetFingerprint: string;
  optimizationDatasetFingerprint: string;
  researchDatasetFingerprint: string;
  schemaVersion: number;
  migration010Present: false;
  rawMarketSnapshotCount: number;
  researchMarketSnapshotCount: number;
  uniqueTokenCount: number;
  uniquePairCount: number;
  firstSnapshotAt: string | null;
  lastSnapshotAt: string | null;
  datasetSpanMs: number | null;
  decisionSampleCount: number;
  labeledCount: number;
  positiveCount: number;
  nonPositiveCount: number;
  censoredCount: number;
  samples: readonly MlDecisionSample[];
  marketSnapshots: readonly MarketSnapshot[];
  riskReports: readonly RiskFeatureInput[];
  optimization: OptimizationDataset;
  walletIntelligenceReadiness: WalletIntelligenceReadiness;
};

export type FittedNumericStats = {
  name: string;
  median: number;
  mean: number;
  std: number;
  observedCount: number;
  missingCount: number;
};

export type FittedPreprocessor = {
  fingerprint: string;
  featureOrder: readonly string[];
  featureTypes: readonly {
    name: string;
    kind: string;
    role: string;
    nullable: boolean;
    missingIndicatorName: string | null;
  }[];
  transformedColumnNames: readonly string[];
  numeric: readonly FittedNumericStats[];
  booleanMissingPolicy: 'observed_false_0_0__observed_true_1_0__missing_0_1';
  medianImputeBooleans: false;
  entirelyMissingImputeZero: true;
  stdDenominator: 'population_N';
  zscoreClip: number;
  clipBounds: readonly [number, number];
  missingIndicatorOrder: 'after_each_nullable_value';
  fittedOn: 'TRAIN_ONLY' | 'FULL_HISTORY_LABELED';
};

export type TransformedRow = {
  sampleIdentity: string;
  values: readonly number[];
};

export type LogisticHyperparameters = {
  learningRate: number;
  maxIterations: number;
  l2Lambda: number;
  interceptRegularized: false;
  probabilityEpsilon: number;
  sigmoidClip: number;
  earlyStopAbsoluteImprovement: number;
  earlyStopConsecutiveIterations: number;
  initialization: 'all_zero';
};

export type LogisticFit = {
  fingerprint: string;
  hyperparameters: LogisticHyperparameters;
  coefficients: readonly number[];
  intercept: number;
  iterations: number;
  finalTrainLoss: number;
  converged: boolean;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
};

export type NullModelFit = {
  fingerprint: string;
  trainPositiveRate: number;
  probability: number;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
};

export type CalibrationBin = {
  binIndex: number;
  startInclusive: number;
  endExclusive: number;
  includesOne: boolean;
  count: number;
  meanPredictedProbability: number | null;
  observedPositiveFraction: number | null;
};

export type ClassificationMetrics = {
  labeledSamples: number;
  positiveCount: number;
  negativeCount: number;
  positiveBaseRate: number | null;
  rocAuc: number | null;
  prAuc: number | null;
  logLoss: number | null;
  brierScore: number | null;
  threshold: number;
  selectedCount: number;
  precision: number | null;
  recall: number | null;
  truePositiveCount: number;
  falsePositiveCount: number;
  trueNegativeCount: number;
  falseNegativeCount: number;
  calibration: readonly CalibrationBin[];
};

export type PredictedSample = {
  sample: MlDecisionSample;
  foldOutcome: MlLabelOutcome;
  probability: number;
  nullProbability: number;
  selected: boolean;
  novelToken: boolean;
};

export type CoefficientRow = {
  feature: string;
  standardizedCoefficient: number;
};

export type FoldPurgeCounts = {
  trainDecisionSamples: number;
  trainSamplesBeforePurge: number;
  trainSamplesPurged: number;
  trainSamplesAfterPurge: number;
  trainCensoredCount: number;
  trainCensoringBps: number | null;
  testDecisionSamples: number;
  testFeatureEligibleSamples: number;
  testSampleCount: number;
  testLabeledCount: number;
  testPositiveCount: number;
  testNegativeCount: number;
  testCensoredCount: number;
  testCensoringBps: number | null;
};

export type FoldEvaluability = {
  evaluable: boolean;
  trainDecisionSamples: number;
  trainLabeled: number;
  trainCensored: number;
  trainCensoringBps: number | null;
  testDecisionSamples: number;
  testLabeled: number;
  testCensored: number;
  testCensoringBps: number | null;
  trainPositives: number;
  trainNegatives: number;
  testPositives: number;
  testNegatives: number;
  reasons: readonly string[];
};

export type SelectedEconomicSlice = {
  testDecisionSamples: number;
  testFeatureEligibleSamples: number;
  testLabeledSamples: number;
  testCensoredSamples: number;
  selectedSamples: number;
  selectedOpened: number;
  completed: number;
  censored: number;
  selectedCensoringBps: number | null;
  selectedIdentities: readonly string[];
  completedIdentities: readonly string[];
  censoredIdentities: readonly string[];
  netBase: ScenarioMetrics | null;
  netStress: ScenarioMetrics | null;
  positiveFoldCount: number | null;
};

export type BaselineFoldStats = {
  openedPositions: number;
  completedTrades: number;
  censoredTrades: number;
  censoringBps: number | null;
  netBaseExpectancy: number | null;
  netStressExpectancy: number | null;
};

export type BaselineComparison = {
  status: 'COMPARABLE' | 'BASELINE_NOT_COMPARABLE';
  aggregateOpened: number;
  aggregateCompleted: number;
  aggregateCensored: number;
  aggregateCensoringBps: number | null;
  perFoldOpened: readonly number[];
  perFoldCompleted: readonly number[];
  perFoldCensored: readonly number[];
  perFoldCensoringBps: readonly (number | null)[];
  baselineBaseExpectancy: number | null;
  baselineStressExpectancy: number | null;
  modelBaseExpectancy: number | null;
  modelStressExpectancy: number | null;
};

export type NovelTokenDiagnostic = {
  count: number;
  rocAuc: number | null;
  logLoss: number | null;
  brierScore: number | null;
  selectedCount: number;
  baseExpectancy: number | null;
};

export type PromotionGate = {
  id: string;
  title: string;
  result: MlGateResult;
  detail: string;
};

export type RuntimeIntegrityCheck = {
  id: string;
  result: 'PASS' | 'FAIL';
  detail: string;
};

export type RuntimeIntegrityReport = {
  status: 'PASS' | 'FAIL';
  checks: readonly RuntimeIntegrityCheck[];
};

export type MlFoldResult = {
  fold: FoldBoundaries;
  purge: FoldPurgeCounts;
  evaluability: FoldEvaluability;
  preprocessorFingerprint: string | null;
  modelFingerprint: string | null;
  nullFingerprint: string | null;
  logistic: LogisticFit | null;
  nullModel: NullModelFit | null;
  coefficients: readonly CoefficientRow[];
  predictedIdentities: readonly string[];
  selectedIdentities: readonly string[];
  testPredictions: readonly PredictedSample[];
  labeledTestPredictions: readonly PredictedSample[];
  metrics: ClassificationMetrics | null;
  nullMetrics: ClassificationMetrics | null;
  selectedEconomics: SelectedEconomicSlice;
  baseline: BaselineFoldStats;
  novelToken: NovelTokenDiagnostic;
  integrityNotes: readonly string[];
};

export type CoefficientStabilityRow = {
  feature: string;
  medianCoefficient: number | null;
  sameSignFoldCount: number;
};

export type ForwardModelCandidate = {
  modelCandidateId: string;
  candidateFingerprint: string;
  trainingDatasetFingerprint: string;
  featureFingerprint: string;
  preprocessingFingerprint: string;
  mlDefinitionFingerprint: string;
  coefficients: readonly number[];
  intercept: number;
  coefficientCanonical: readonly string[];
  interceptCanonical: string;
  threshold: number;
  labeledTrainingCount: number;
  positiveCount: number;
  negativeCount: number;
  trainingEndTime: string | null;
  trainingCutoffAt: string | null;
  trainingCutoffMs: number | null;
  iterations: number;
  finalTrainLoss: number;
  converged: boolean;
};

export type MlWalkForwardReport = {
  mlDefinitionFingerprint: string;
  mlDatasetFingerprint: string;
  segments: ChronologicalSegment[] | null;
  folds: readonly MlFoldResult[];
  aggregateMetrics: ClassificationMetrics | null;
  aggregateNullMetrics: ClassificationMetrics | null;
  aggregateSelectedEconomics: SelectedEconomicSlice;
  baselineComparison: BaselineComparison;
  novelToken: NovelTokenDiagnostic;
  coefficientStability: readonly CoefficientStabilityRow[];
  integrity: RuntimeIntegrityReport;
  promotionStatus: MlPromotionStatus;
  promotionGates: readonly PromotionGate[];
  candidateEligible: boolean;
  candidateTrainingInvoked: boolean;
  candidate: ForwardModelCandidate | null;
};
