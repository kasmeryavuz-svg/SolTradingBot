import { EXIT_STOP_LOSS_BPS, EXIT_TAKE_PROFIT_BPS, EXIT_MAX_HOLDING_MS } from '../exit/constants.js';
import {
  fingerprintFlowQualityCandidate,
  fingerprintOptimizationEntry,
  fingerprintQualityLiquidCandidate,
  fingerprintRunnerFlowCandidate,
} from './entries.js';
import { fingerprintExitCandidate } from './exits.js';
import {
  COST_BASE_ENTRY_BPS,
  COST_BASE_EXIT_BPS,
  COST_LOW_ENTRY_BPS,
  COST_LOW_EXIT_BPS,
  COST_STRESS_ENTRY_BPS,
  COST_STRESS_EXIT_BPS,
  ENTRY_CANDIDATE_COUNT,
  EXIT_CANDIDATE_COUNT,
  MOONBAG_CLOSE_FRACTION,
  MOONBAG_INITIAL_STOP_BPS,
  MOONBAG_MAX_HOLDING_MS,
  MOONBAG_TAKE_BPS,
  MOONBAG_TRAIL_BPS,
  PARTIAL_RUNNER_CLOSE_FRACTION,
  PARTIAL_RUNNER_INITIAL_STOP_BPS,
  PARTIAL_RUNNER_MAX_HOLDING_MS,
  PARTIAL_RUNNER_TAKE_BPS,
  PARTIAL_RUNNER_TRAIL_BPS,
  TIGHT_RISK_MAX_HOLDING_MS,
  TIGHT_RISK_STOP_BPS,
  TIGHT_RISK_TAKE_BPS,
  WIDER_RUNNER_MAX_HOLDING_MS,
  WIDER_RUNNER_STOP_BPS,
  WIDER_RUNNER_TAKE_BPS,
} from './constants.js';
import { listCostScenarios } from './costs.js';
import {
  OPTIMIZATION_ENTRY_CANDIDATE_IDS,
  OPTIMIZATION_EXIT_CANDIDATE_IDS,
  OptimizationError,
  type OptimizationEntryCandidateId,
  type OptimizationEntryDescriptor,
  type OptimizationExitCandidateId,
  type OptimizationExitDescriptor,
} from './types.js';

export function listOptimizationEntryDescriptors(): OptimizationEntryDescriptor[] {
  return [
    {
      candidateId: 's07_baseline',
      candidateVersion: 's07_v1',
      candidateName: 'frozen_s07_v1_control_baseline',
      description: 'Frozen r125 s07_baseline. Delegates to evaluateStrategy. Unchanged.',
      candidateDefinitionFingerprint: fingerprintOptimizationEntry('s07_baseline'),
      frozenR125: true,
    },
    {
      candidateId: 'quality_control_v1',
      candidateVersion: 'quality_control_v1',
      candidateName: 'market_quality_and_risk_eligibility_control',
      description: 'Frozen r125 quality-control common gate. No momentum overlay.',
      candidateDefinitionFingerprint: fingerprintOptimizationEntry('quality_control_v1'),
      frozenR125: true,
    },
    {
      candidateId: 'time_series_momentum_v1',
      candidateVersion: 'time_series_momentum_v1',
      candidateName: 'multi_horizon_provider_window_momentum_proxy',
      description: 'Frozen r125 time-series momentum proxy. Unchanged.',
      candidateDefinitionFingerprint: fingerprintOptimizationEntry('time_series_momentum_v1'),
      frozenR125: true,
    },
    {
      candidateId: 'flow_confirmed_momentum_v1',
      candidateVersion: 'flow_confirmed_momentum_v1',
      candidateName: 'flow_confirmed_short_horizon_momentum_proxy',
      description: 'Frozen r125 flow-confirmed momentum proxy. Unchanged.',
      candidateDefinitionFingerprint: fingerprintOptimizationEntry('flow_confirmed_momentum_v1'),
      frozenR125: true,
    },
    {
      candidateId: 'runner_friendly_momentum_v1',
      candidateVersion: 'runner_friendly_momentum_v1',
      candidateName: 's07_entry_ablation_without_5m_momentum_cap',
      description: 'Frozen r125 runner-friendly ablation. Unchanged.',
      candidateDefinitionFingerprint: fingerprintOptimizationEntry('runner_friendly_momentum_v1'),
      frozenR125: true,
    },
    {
      candidateId: 'quality_liquid_v1',
      candidateVersion: 'quality_liquid_v1',
      candidateName: 'deeper_liquidity_and_activity_quality_overlay',
      description:
        'Common r125 quality/risk gate plus liquidity_usd >= 100000, pair_age 1800-604800s, trades_5m >= 30. No extra momentum.',
      candidateDefinitionFingerprint: fingerprintQualityLiquidCandidate(),
      frozenR125: false,
    },
    {
      candidateId: 'flow_quality_v1',
      candidateVersion: 'flow_quality_v1',
      candidateName: 'liquid_flow_confirmed_capped_momentum',
      description:
        's07/r125 risk blockers plus deeper liquidity/activity, 5m flow, 5m momentum band 1-15%, and 1h buy majority.',
      candidateDefinitionFingerprint: fingerprintFlowQualityCandidate(),
      frozenR125: false,
    },
    {
      candidateId: 'runner_flow_v1',
      candidateVersion: 'runner_flow_v1',
      candidateName: 'stronger_flow_uncapped_5m_runner',
      description:
        's07/r125 risk blockers plus deeper liquidity/activity, stronger 5m flow, 5m momentum >= 3% with no cap, and 1h price change > 0.',
      candidateDefinitionFingerprint: fingerprintRunnerFlowCandidate(),
      frozenR125: false,
    },
  ];
}

export function listOptimizationExitDescriptors(): OptimizationExitDescriptor[] {
  return [
    {
      candidateId: 'x11_baseline',
      candidateVersion: 'x11_v1',
      candidateName: 'frozen_x11_full_close_baseline',
      description: `Frozen x11 historical control: stop -${String(EXIT_STOP_LOSS_BPS / 100)}%, take +${String(EXIT_TAKE_PROFIT_BPS / 100)}%, max hold ${String(EXIT_MAX_HOLDING_MS / 3_600_000)}h, 100% close. Take fill uses frozen x11 OBSERVED-price semantics, not o17 target-take. Stage B is not a perfectly normalized execution comparison.`,
      candidateDefinitionFingerprint: fingerprintExitCandidate('x11_baseline'),
      usesFrozenX11Evaluator: true,
    },
    {
      candidateId: 'tight_risk_v1',
      candidateVersion: 'tight_risk_v1',
      candidateName: 'tighter_stop_take_shorter_hold',
      description: `Stop -${String(TIGHT_RISK_STOP_BPS / 100)}%, take +${String(TIGHT_RISK_TAKE_BPS / 100)}%, max hold ${String(TIGHT_RISK_MAX_HOLDING_MS / 3_600_000)}h, 100% close. Conservative observation fills.`,
      candidateDefinitionFingerprint: fingerprintExitCandidate('tight_risk_v1'),
      usesFrozenX11Evaluator: false,
    },
    {
      candidateId: 'wider_runner_v1',
      candidateVersion: 'wider_runner_v1',
      candidateName: 'wider_stop_take_longer_hold',
      description: `Stop -${String(WIDER_RUNNER_STOP_BPS / 100)}%, take +${String(WIDER_RUNNER_TAKE_BPS / 100)}%, max hold ${String(WIDER_RUNNER_MAX_HOLDING_MS / 3_600_000)}h, 100% close. Conservative observation fills.`,
      candidateDefinitionFingerprint: fingerprintExitCandidate('wider_runner_v1'),
      usesFrozenX11Evaluator: false,
    },
    {
      candidateId: 'partial_runner_v1',
      candidateVersion: 'partial_runner_v1',
      candidateName: 'half_close_then_observed_trail',
      description: `Initial stop -${String(PARTIAL_RUNNER_INITIAL_STOP_BPS / 100)}%. At +${String(PARTIAL_RUNNER_TAKE_BPS / 100)}% close ${String(PARTIAL_RUNNER_CLOSE_FRACTION)} original quantity. Remainder trails ${String(PARTIAL_RUNNER_TRAIL_BPS / 100)}% below highest observed post-entry price. Max hold ${String(PARTIAL_RUNNER_MAX_HOLDING_MS / 3_600_000)}h.`,
      candidateDefinitionFingerprint: fingerprintExitCandidate('partial_runner_v1'),
      usesFrozenX11Evaluator: false,
    },
    {
      candidateId: 'moonbag_runner_v1',
      candidateVersion: 'moonbag_runner_v1',
      candidateName: 'two_thirds_close_then_wide_observed_trail',
      description: `Initial stop -${String(MOONBAG_INITIAL_STOP_BPS / 100)}%. At +${String(MOONBAG_TAKE_BPS / 100)}% close ${String(MOONBAG_CLOSE_FRACTION)} original quantity. Remainder trails ${String(MOONBAG_TRAIL_BPS / 100)}% below highest observed post-entry price. Max hold ${String(MOONBAG_MAX_HOLDING_MS / 3_600_000)}h.`,
      candidateDefinitionFingerprint: fingerprintExitCandidate('moonbag_runner_v1'),
      usesFrozenX11Evaluator: false,
    },
  ];
}

export function optimizationEntryCatalog(): readonly {
  candidateId: OptimizationEntryCandidateId;
  candidateDefinitionFingerprint: string;
}[] {
  return listOptimizationEntryDescriptors().map((item) => ({
    candidateId: item.candidateId,
    candidateDefinitionFingerprint: item.candidateDefinitionFingerprint,
  }));
}

export function optimizationExitCatalog(): readonly {
  candidateId: OptimizationExitCandidateId;
  candidateDefinitionFingerprint: string;
}[] {
  return listOptimizationExitDescriptors().map((item) => ({
    candidateId: item.candidateId,
    candidateDefinitionFingerprint: item.candidateDefinitionFingerprint,
  }));
}

export function getOptimizationEntryDescriptor(
  candidateId: OptimizationEntryCandidateId,
): OptimizationEntryDescriptor {
  const found = listOptimizationEntryDescriptors().find((item) => item.candidateId === candidateId);
  if (found === undefined) {
    throw new OptimizationError(`Missing entry candidate ${candidateId}.`);
  }
  return found;
}

export function getOptimizationExitDescriptor(
  candidateId: OptimizationExitCandidateId,
): OptimizationExitDescriptor {
  const found = listOptimizationExitDescriptors().find((item) => item.candidateId === candidateId);
  if (found === undefined) {
    throw new OptimizationError(`Missing exit candidate ${candidateId}.`);
  }
  return found;
}

export function assertFrozenCatalogCounts(): void {
  if (listOptimizationEntryDescriptors().length !== ENTRY_CANDIDATE_COUNT) {
    throw new OptimizationError('Entry catalog must contain exactly 8 candidates.');
  }
  if (listOptimizationExitDescriptors().length !== EXIT_CANDIDATE_COUNT) {
    throw new OptimizationError('Exit catalog must contain exactly 5 candidates.');
  }
  if (
    JSON.stringify(listOptimizationEntryDescriptors().map((item) => item.candidateId)) !==
    JSON.stringify([...OPTIMIZATION_ENTRY_CANDIDATE_IDS])
  ) {
    throw new OptimizationError('Entry catalog order must match the frozen candidateId registry.');
  }
  if (
    JSON.stringify(listOptimizationExitDescriptors().map((item) => item.candidateId)) !==
    JSON.stringify([...OPTIMIZATION_EXIT_CANDIDATE_IDS])
  ) {
    throw new OptimizationError('Exit catalog order must match the frozen candidateId registry.');
  }
  if (listCostScenarios().length !== 3) {
    throw new OptimizationError('Cost catalog must contain LOW, BASE, and STRESS.');
  }
  const expectedBps = [
    [COST_LOW_ENTRY_BPS, COST_LOW_EXIT_BPS],
    [COST_BASE_ENTRY_BPS, COST_BASE_EXIT_BPS],
    [COST_STRESS_ENTRY_BPS, COST_STRESS_EXIT_BPS],
  ];
  listCostScenarios().forEach((scenario, index) => {
    const expected = expectedBps[index];
    if (expected === undefined) {
      throw new OptimizationError('Cost catalog mismatch.');
    }
    if (scenario.entryBps !== expected[0] || scenario.exitBps !== expected[1]) {
      throw new OptimizationError('Cost scenario bps must remain frozen.');
    }
  });
}

assertFrozenCatalogCounts();
