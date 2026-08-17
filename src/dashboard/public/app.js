export const AUTO_REFRESH_MS = 15_000;
export const API_DASHBOARD = '/api/v1/dashboard';
export const API_HEALTH = '/api/v1/database-health';

const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ALLOWED_ATTRS = new Set(['role', 'aria-label', 'aria-current', 'scope', 'type', 'data-section']);

export function formatCount(value) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  const signed = Object.is(value, -0) ? 0 : value;
  return String(Math.trunc(signed));
}

export function formatUsd(value) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  const signed = Object.is(value, -0) ? 0 : value;
  const magnitude = Math.abs(signed);
  if (magnitude === 0) {
    return '0';
  }
  if (magnitude >= 1000) {
    return signed.toFixed(2);
  }
  if (magnitude >= 1) {
    return signed.toFixed(4);
  }
  if (magnitude >= 0.0001) {
    return signed.toFixed(6);
  }
  if (magnitude >= 1e-8) {
    return signed.toFixed(8);
  }
  const exponent = Math.floor(Math.log10(magnitude));
  const decimals = Math.min(18, Math.max(8, -exponent + 2));
  return trimTrailingZeros(signed.toFixed(decimals));
}

export function formatPercent(value) {
  if (value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return 'n/a';
  }
  const signed = Object.is(value, -0) ? 0 : value;
  return `${signed.toFixed(2)}%`;
}

export function formatTimestamp(value) {
  if (typeof value !== 'string' || !CANONICAL_UTC.test(value)) {
    return 'n/a';
  }
  return value;
}

export function text(value) {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 'n/a';
  }
  return String(value);
}

function trimTrailingZeros(formatted) {
  if (!formatted.includes('.')) {
    return formatted;
  }
  return formatted.replace(/0+$/, '').replace(/\.$/, '');
}

function abbreviate(value, head = 8, tail = 6) {
  if (typeof value !== 'string') {
    return 'n/a';
  }
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function dash(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return text(value);
}

export function createDashboardApp(bindings) {
  const document = bindings.document;
  const fetchImpl = bindings.fetch;
  const nowIso = bindings.nowIso ?? (() => new Date().toISOString());
  const setIntervalFn = bindings.setIntervalFn ?? ((handler, ms) => window.setInterval(handler, ms));
  const clearIntervalFn = bindings.clearIntervalFn ?? ((id) => window.clearInterval(id));

  const state = {
    snapshot: null,
    health: null,
    section: 'overview',
    autoRefreshTimer: null,
    healthRequested: false,
    dashboardSeq: 0,
    healthSeq: 0,
    dashboardAbort: null,
    healthAbort: null,
  };

  const els = {
    overview: document.querySelector('#section-overview'),
    market: document.querySelector('#section-market'),
    paper: document.querySelector('#section-paper'),
    performance: document.querySelector('#section-performance'),
    research: document.querySelector('#section-research'),
    health: document.querySelector('#section-health'),
    lastRefreshed: document.querySelector('#last-refreshed'),
    refresh: document.querySelector('#refresh'),
    autoRefresh: document.querySelector('#auto-refresh'),
  };

  function el(tag, options = {}) {
    const node = document.createElement(tag);
    if (options.className) {
      node.className = options.className;
    }
    if (options.text !== undefined) {
      node.textContent = options.text;
    }
    if (options.id) {
      node.id = options.id;
    }
    if (options.title) {
      node.title = options.title;
    }
    if (options.attrs) {
      for (const [name, value] of Object.entries(options.attrs)) {
        if (ALLOWED_ATTRS.has(name) && typeof value === 'string') {
          node.setAttribute(name, value);
        }
      }
    }
    return node;
  }

  function clear(node) {
    if (node === null || node === undefined) {
      return;
    }
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function heading(level, textValue, id) {
    const tag = level === 1 ? 'h1' : 'h2';
    return el(tag, { text: textValue, id, className: 'section-title' });
  }

  function caption(textValue) {
    return el('p', { className: 'caption', text: textValue });
  }

  function metricCard(label, value) {
    const card = el('article', { className: 'card' });
    card.append(
      el('h3', { className: 'metric-label', text: label }),
      el('p', { className: 'metric-value', text: value }),
    );
    return card;
  }

  function emptyState(message) {
    return el('p', { className: 'empty-state', text: message });
  }

  function unavailable(reason) {
    return el('p', {
      className: 'empty-state section-unavailable',
      text: `Section unavailable${reason ? `: ${reason}` : '.'}`,
    });
  }

  function table(headers, rows, rowToCells) {
    const wrap = el('div', { className: 'table-wrap' });
    const tableNode = el('table');
    const thead = el('thead');
    const headRow = el('tr');
    for (const header of headers) {
      headRow.append(el('th', { text: header, attrs: { scope: 'col' } }));
    }
    thead.append(headRow);
    const tbody = el('tbody');
    for (const row of rows) {
      const tr = el('tr');
      for (const cell of rowToCells(row)) {
        const td = el('td');
        if (cell.mono) {
          td.className = 'mono';
        }
        td.textContent = cell.text;
        if (cell.title) {
          td.title = cell.title;
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    tableNode.append(thead, tbody);
    wrap.append(tableNode);
    return wrap;
  }

  function badge(textValue, className) {
    return el('span', { className: `badge ${className}`, text: textValue });
  }

  function appendGrid(parent, cards) {
    const grid = el('div', { className: 'metric-grid' });
    for (const card of cards) {
      grid.append(card);
    }
    parent.append(grid);
  }

  function renderLoadError(message) {
    clear(els.overview);
    clear(els.market);
    clear(els.paper);
    clear(els.performance);
    clear(els.research);
    clear(els.health);
    if (els.lastRefreshed) {
      els.lastRefreshed.textContent = 'Last refreshed: unavailable';
    }
    els.overview.append(unavailable(message));
  }

  function renderOverview(snapshot) {
    const root = els.overview;
    clear(root);
    root.append(heading(1, 'Overview', 'overview-title'));
    root.append(
      caption(
        'Observability view. Each section is rebuilt independently from read-only local evidence. This is not an atomic trading snapshot.',
      ),
    );

    const safety = snapshot.safety;
    const badges = el('div', { className: 'badge-row' });
    badges.append(
      badge(`Blockchain ${safety.blockchainCapability}`, 'badge-readonly'),
      badge(`Trading ${safety.tradingCapability}`, 'badge-disabled'),
      badge(`Wallet ${safety.walletCapability}`, 'badge-disabled'),
      badge(`Execution ${safety.executionCapability}`, 'badge-disabled'),
      badge(`Research ${safety.researchCapability}`, 'badge-ok'),
      badge(`Performance ${safety.performanceCapability}`, 'badge-ok'),
    );
    root.append(badges);

    appendGrid(root, [
      metricCard('Checkpoint', safety.checkpoint),
      metricCard('Spec', snapshot.meta.dashboardSpecVersion),
      metricCard('Generated at', formatTimestamp(snapshot.meta.generatedAt)),
      metricCard('Database', snapshot.database.data?.status ?? snapshot.database.state),
      metricCard('Schema', formatCount(snapshot.database.data?.schemaVersion ?? null)),
      metricCard('Solana network', snapshot.configuration.solanaNetwork),
      metricCard('Node environment', snapshot.configuration.nodeEnv),
      metricCard('Discovery', snapshot.configuration.discoveryEnabled ? 'enabled' : 'disabled'),
      metricCard('DB file', text(snapshot.configuration.databaseFilename)),
      metricCard('Watchlist tokens', formatCount(snapshot.configuration.configuredMarketTokenCount)),
    ]);

    const counts = snapshot.database.data?.counts;
    root.append(heading(2, 'Coverage'));
    if (snapshot.database.state === 'unavailable' || snapshot.database.state === 'error') {
      root.append(unavailable(snapshot.database.reason));
      return;
    }
    if (counts === null || counts === undefined) {
      root.append(emptyState('No coverage counts.'));
      return;
    }
    appendGrid(root, [
      metricCard('Tokens', formatCount(counts.tokens)),
      metricCard('Market snapshots', formatCount(counts.marketSnapshots)),
      metricCard('Risk scans', formatCount(counts.riskScans)),
      metricCard('Feature vectors', formatCount(counts.featureVectors)),
      metricCard('Strategy evaluations', formatCount(counts.strategyEvaluations)),
      metricCard('Paper evaluations', formatCount(counts.paperEvaluations)),
      metricCard('Position evaluations', formatCount(counts.positionEvaluations)),
      metricCard('Paper positions', formatCount(counts.paperPositions)),
      metricCard('Open paper positions', formatCount(counts.paperOpenPositions)),
      metricCard('Exit evaluations', formatCount(counts.exitEvaluations)),
      metricCard('Paper position exits', formatCount(counts.paperPositionExits)),
      metricCard('Latest stored market', formatTimestamp(snapshot.database.data?.latestMarketCollectedAt ?? null)),
    ]);
  }

  function renderMarket(snapshot) {
    const root = els.market;
    clear(root);
    root.append(heading(1, 'Market', 'market-title'));
    root.append(caption('Latest stored observations. These are not live prices.'));
    const section = snapshot.market;
    if (section.state === 'unavailable' || section.state === 'error') {
      root.append(unavailable(section.reason));
      return;
    }
    if (section.state === 'empty' || !section.data || section.data.rows.length === 0) {
      root.append(emptyState('No stored market snapshots yet.'));
      return;
    }
    root.append(
      table(
        [
          'Symbol',
          'Mint',
          'Pair',
          'DEX',
          'Price USD',
          'Liquidity USD',
          'Volume 5m',
          'Buys 5m',
          'Sells 5m',
          'Chg 5m',
          'Chg 1h',
          'Chg 24h',
          'Collected at',
        ],
        section.data.rows,
        (row) => [
          { text: dash(row.tokenSymbol), title: row.tokenName ?? '' },
          { text: abbreviate(row.tokenMint), title: row.tokenMint, mono: true },
          { text: abbreviate(row.pairAddress), title: row.pairAddress, mono: true },
          { text: dash(row.dexName) },
          { text: row.priceUsd === null ? '—' : formatUsd(row.priceUsd) },
          { text: row.liquidityUsd === null ? '—' : formatUsd(row.liquidityUsd) },
          { text: row.volume5mUsd === null ? '—' : formatUsd(row.volume5mUsd) },
          { text: row.buys5m === null ? '—' : formatCount(row.buys5m) },
          { text: row.sells5m === null ? '—' : formatCount(row.sells5m) },
          { text: row.priceChange5mPct === null ? '—' : formatPercent(row.priceChange5mPct) },
          { text: row.priceChange1hPct === null ? '—' : formatPercent(row.priceChange1hPct) },
          { text: row.priceChange24hPct === null ? '—' : formatPercent(row.priceChange24hPct) },
          { text: formatTimestamp(row.collectedAt), mono: true },
        ],
      ),
    );
  }

  function renderPaper(snapshot) {
    const root = els.paper;
    clear(root);
    root.append(heading(1, 'Runtime Paper Lifecycle', 'paper-title'));
    root.append(
      caption('Runtime p09/pm10/x11 paper positions only. Research lab trades are not shown here.'),
    );
    const section = snapshot.runtimePaper;
    if (section.state === 'unavailable' || section.state === 'error') {
      root.append(unavailable(section.reason));
      return;
    }
    const data = section.data;
    if (!data || (data.openPositions.length === 0 && data.recentClosedTrades.length === 0)) {
      root.append(emptyState('No runtime paper positions or completed runtime paper trades yet.'));
      return;
    }
    root.append(heading(2, 'Open paper positions'));
    if (data.openPositions.length === 0) {
      root.append(emptyState('No current open runtime paper positions.'));
    } else {
      root.append(
        table(
          ['Mint', 'Pair', 'Opened at', 'Entry ref. price', '$100 notional', 'Quantity', 'Source'],
          data.openPositions,
          (row) => [
            { text: abbreviate(row.tokenMint), title: row.tokenMint, mono: true },
            { text: abbreviate(row.pairAddress), title: row.pairAddress, mono: true },
            { text: formatTimestamp(row.openedAt), mono: true },
            { text: formatUsd(row.entryReferencePriceUsd) },
            { text: formatUsd(row.referenceNotionalUsd) },
            { text: formatUsd(row.quantityTokens) },
            { text: row.positionSourceIdentityAbbreviated, mono: true },
          ],
        ),
      );
    }
    root.append(heading(2, 'Recent completed runtime paper trades'));
    if (data.recentClosedTrades.length === 0) {
      root.append(emptyState('No completed runtime paper trades yet.'));
      return;
    }
    root.append(
      table(
        ['Mint', 'Pair', 'Opened', 'Exited', 'Entry', 'Exit', 'GROSS PnL', 'Return', 'Outcome'],
        data.recentClosedTrades,
        (row) => [
          { text: abbreviate(row.tokenMint), title: row.tokenMint, mono: true },
          { text: abbreviate(row.pairAddress), title: row.pairAddress, mono: true },
          { text: formatTimestamp(row.openedAt), mono: true },
          { text: formatTimestamp(row.exitedAt), mono: true },
          { text: formatUsd(row.entryReferencePriceUsd) },
          { text: formatUsd(row.exitPriceUsd) },
          { text: formatUsd(row.grossPnlUsd) },
          { text: formatPercent(row.grossReturnPct) },
          { text: row.outcome },
        ],
      ),
    );
  }

  function drawChart(points) {
    const canvas = el('canvas', {
      attrs: { role: 'img', 'aria-label': 'Closed-trade cumulative GROSS paper PnL' },
    });
    canvas.width = 900;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');
    if (!ctx || points.length === 0) {
      return canvas;
    }
    const values = points.map((point) => point.cumulativeGrossPnlUsd);
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const span = max - min || 1;
    const pad = 24;
    ctx.strokeStyle = '#8b9bb4';
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, canvas.height - pad);
    ctx.lineTo(canvas.width - pad, canvas.height - pad);
    ctx.stroke();
    ctx.strokeStyle = '#c9a227';
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = pad + (index / Math.max(points.length - 1, 1)) * (canvas.width - pad * 2);
      const y = canvas.height - pad - ((point.cumulativeGrossPnlUsd - min) / span) * (canvas.height - pad * 2);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    return canvas;
  }

  function renderPerformance(snapshot) {
    const root = els.performance;
    clear(root);
    root.append(heading(1, 'GROSS PAPER PERFORMANCE', 'performance-title'));
    root.append(caption('NOT NET. NOT LIVE. Closed-trade GROSS paper analytics from frozen a12.'));
    const section = snapshot.performance;
    if (section.state === 'unavailable' || section.state === 'error') {
      root.append(unavailable(section.reason));
      return;
    }
    if (section.state === 'empty' || section.data?.emptyMessage) {
      root.append(emptyState(section.data?.emptyMessage ?? 'No closed runtime paper trades yet.'));
      return;
    }
    const report = section.data.report;
    appendGrid(root, [
      metricCard('Closed trades', formatCount(report.dataset.closedTradeCount)),
      metricCard('Wins', formatCount(report.counts.winCount)),
      metricCard('Losses', formatCount(report.counts.lossCount)),
      metricCard('Breakeven', formatCount(report.counts.breakevenCount)),
      metricCard('Win rate', formatPercent(report.rates.winRatePct)),
      metricCard('Total reference notional', formatUsd(report.capitalReferenceTotals.totalReferenceNotionalUsd)),
      metricCard('Total GROSS exit value', formatUsd(report.capitalReferenceTotals.totalGrossExitValueUsd)),
      metricCard('Total GROSS PnL', formatUsd(report.capitalReferenceTotals.totalGrossPnlUsd)),
      metricCard('Aggregate GROSS return', formatPercent(report.aggregateGrossReturnPct)),
      metricCard('Mean return', formatPercent(report.distribution.meanGrossReturnPct)),
      metricCard('Median return', formatPercent(report.distribution.medianGrossReturnPct)),
      metricCard('Best return', formatPercent(report.distribution.bestGrossReturnPct)),
      metricCard('Worst return', formatPercent(report.distribution.worstGrossReturnPct)),
      metricCard('Profit factor', report.profitFactor === null ? 'n/a' : formatUsd(report.profitFactor)),
      metricCard('Payoff ratio', report.payoffRatio === null ? 'n/a' : formatUsd(report.payoffRatio)),
      metricCard('Max closed-trade drawdown USD', formatUsd(report.maxClosedTradeCumulativePnlDrawdownUsd)),
      metricCard('Top1 winner contribution', formatPercent(report.concentration.top1WinnerGrossPnlContributionPct)),
      metricCard('Top3 winner contribution', formatPercent(report.concentration.top3WinnersGrossPnlContributionPct)),
      metricCard('PnL excluding top1', formatUsd(report.concentration.grossPnlExcludingTop1WinnerUsd)),
      metricCard('PnL excluding top3', formatUsd(report.concentration.grossPnlExcludingTop3WinnersUsd)),
    ]);
    const points = section.data.closedTradeCumulativeGrossPnl ?? [];
    if (points.length > 0) {
      const chartCard = el('div', { className: 'chart-card' });
      chartCard.append(el('h2', { text: 'Closed-trade cumulative GROSS paper PnL' }));
      chartCard.append(drawChart(points));
      root.append(chartCard);
    }
  }

  function renderResearch(snapshot) {
    const root = els.research;
    clear(root);
    root.append(heading(1, 'STRATEGY RESEARCH LAB', 'research-title'));
    root.append(
      caption('HISTORICAL GROSS PAPER REFERENCE. NOT LIVE. NOT OPTIMIZED. Canonical candidate order, not ranked.'),
    );
    const section = snapshot.research;
    if (section.state === 'unavailable' || section.state === 'error') {
      root.append(unavailable(section.reason));
      return;
    }
    const data = section.data;
    if (!data) {
      root.append(emptyState('No research report.'));
      return;
    }
    appendGrid(root, [
      metricCard('Raw snapshots', formatCount(data.rawMarketSnapshotCount)),
      metricCard('Excluded runtime-exit snapshots', formatCount(data.runtimeExitReferencedSnapshotCountExcluded)),
      metricCard('Research snapshots', formatCount(data.researchMarketSnapshotCount)),
      metricCard('Unique tokens', formatCount(data.uniqueTokenCount)),
      metricCard('Unique pairs', formatCount(data.uniquePairCount)),
      metricCard('Risk scans', formatCount(data.riskScanCount)),
      metricCard('Tokens with risk', formatCount(data.uniqueTokensWithRiskScan)),
      metricCard('First snapshot', formatTimestamp(data.firstSnapshotAt)),
      metricCard('Last snapshot', formatTimestamp(data.lastSnapshotAt)),
      metricCard('Dataset fingerprint', data.researchDatasetFingerprintAbbreviated),
    ]);
    root.append(
      table(
        [
          'Candidate',
          'entry_candidate',
          'no_entry',
          'insufficient_data',
          'Opened',
          'Completed',
          'Unresolved',
          'W/L/BE',
          'Total GROSS PnL',
          'Agg. GROSS return',
          'Profit factor',
          'Drawdown',
          'Top1',
          'Top3',
        ],
        data.candidates,
        (row) => [
          { text: row.candidateId, title: row.candidateName },
          { text: formatCount(row.decisions.entryCandidateCount) },
          { text: formatCount(row.decisions.noEntryCount) },
          { text: formatCount(row.decisions.insufficientDataCount) },
          { text: formatCount(row.lifecycle.positionsOpened) },
          { text: formatCount(row.lifecycle.completedPositions) },
          { text: formatCount(row.lifecycle.unresolvedPositions) },
          { text: `${formatCount(row.winCount)}/${formatCount(row.lossCount)}/${formatCount(row.breakevenCount)}` },
          { text: formatUsd(row.totalGrossPnlUsd) },
          { text: row.aggregateGrossReturnPct === null ? 'n/a' : formatPercent(row.aggregateGrossReturnPct) },
          { text: row.profitFactor === null ? 'n/a' : formatUsd(row.profitFactor) },
          {
            text:
              row.maxClosedTradeCumulativePnlDrawdownUsd === null
                ? 'n/a'
                : formatUsd(row.maxClosedTradeCumulativePnlDrawdownUsd),
          },
          {
            text:
              row.top1WinnerGrossPnlContributionPct === null
                ? 'n/a'
                : formatPercent(row.top1WinnerGrossPnlContributionPct),
          },
          {
            text:
              row.top3WinnersGrossPnlContributionPct === null
                ? 'n/a'
                : formatPercent(row.top3WinnersGrossPnlContributionPct),
          },
        ],
      ),
    );
    root.append(heading(2, 'Descriptive chronological slices'));
    root.append(caption('Early / middle / late slices from r125. Not out-of-sample proof.'));
    const sliceRows = [];
    for (const candidate of data.candidates) {
      for (const slice of candidate.slices) {
        sliceRows.push({ candidateId: candidate.candidateId, slice });
      }
    }
    if (sliceRows.length === 0) {
      root.append(emptyState('No slice metrics to display.'));
      return;
    }
    root.append(
      table(
        ['Candidate', 'Slice', 'Completed', 'GROSS PnL', 'Mean return', 'Win rate', 'Profit factor', 'Top1'],
        sliceRows,
        (row) => [
          { text: row.candidateId },
          { text: row.slice.slice },
          { text: formatCount(row.slice.completedTradeCount) },
          { text: row.slice.totalGrossPnlUsd === null ? 'n/a' : formatUsd(row.slice.totalGrossPnlUsd) },
          { text: row.slice.meanGrossReturnPct === null ? 'n/a' : formatPercent(row.slice.meanGrossReturnPct) },
          { text: row.slice.winRatePct === null ? 'n/a' : formatPercent(row.slice.winRatePct) },
          { text: row.slice.profitFactor === null ? 'n/a' : formatUsd(row.slice.profitFactor) },
          {
            text:
              row.slice.top1WinnerGrossPnlContributionPct === null
                ? 'n/a'
                : formatPercent(row.slice.top1WinnerGrossPnlContributionPct),
          },
        ],
      ),
    );
  }

  function renderHealth(snapshot, healthPayload) {
    const root = els.health;
    clear(root);
    root.append(heading(1, 'Data Health', 'health-title'));
    root.append(caption('Raw stored counts only. No proprietary quality score.'));
    const quality = snapshot.dataQuality;
    if (quality.state === 'unavailable' || quality.state === 'error') {
      root.append(unavailable(quality.reason));
    } else if (quality.data) {
      appendGrid(root, [
        metricCard('Market snapshots', formatCount(quality.data.marketSnapshotCount)),
        metricCard('Tokens', formatCount(quality.data.tokenCount)),
        metricCard('Risk scans', formatCount(quality.data.riskScanCount)),
        metricCard('Tokens with risk', formatCount(quality.data.tokensWithRisk)),
        metricCard('Feature vectors', formatCount(quality.data.featureVectorCount)),
        metricCard('Strategy evaluations', formatCount(quality.data.strategyEvaluationCount)),
        metricCard('Runtime completed trades', formatCount(quality.data.runtimeCompletedTradeCount)),
      ]);
      if (quality.data.researchInsufficientDataCounts) {
        root.append(heading(2, 'Research insufficient_data counts'));
        appendGrid(
          root,
          Object.entries(quality.data.researchInsufficientDataCounts).map(([id, count]) =>
            metricCard(id, formatCount(count)),
          ),
        );
      }
    }

    root.append(heading(2, 'Integrity'));
    root.append(
      caption('PRAGMA integrity_check and foreign_key_check are read-only and are not run on auto-refresh.'),
    );
    const checkButton = el('button', { text: 'Check database integrity' });
    checkButton.type = 'button';
    checkButton.addEventListener('click', () => {
      void loadHealth();
    });
    root.append(checkButton);
    if (!healthPayload) {
      root.append(emptyState('Integrity: not_checked'));
      return;
    }
    const health = healthPayload.health;
    if (health.state === 'unavailable' || health.state === 'error') {
      root.append(unavailable(health.reason));
      return;
    }
    appendGrid(root, [
      metricCard('Status', health.data?.status ?? health.state),
      metricCard('Schema', formatCount(health.data?.schemaVersion ?? null)),
      metricCard('integrity_check', health.data?.integrityCheck ?? 'n/a'),
      metricCard('foreign_key violations', formatCount(health.data?.foreignKeyViolations ?? null)),
      metricCard('query_only', text(health.data?.queryOnly)),
      metricCard('Checked at', formatTimestamp(health.data?.checkedAt ?? null)),
    ]);
  }

  function renderAll() {
    if (!state.snapshot) {
      return;
    }
    renderOverview(state.snapshot);
    renderMarket(state.snapshot);
    renderPaper(state.snapshot);
    renderPerformance(state.snapshot);
    renderResearch(state.snapshot);
    renderHealth(state.snapshot, state.health);
  }

  function showSection(name) {
    state.section = name;
    const map = {
      overview: els.overview,
      market: els.market,
      paper: els.paper,
      performance: els.performance,
      research: els.research,
      health: els.health,
    };
    for (const [key, node] of Object.entries(map)) {
      if (node) {
        node.hidden = key !== name;
      }
    }
    for (const button of document.querySelectorAll('.nav-btn')) {
      const active = button.getAttribute('data-section') === name;
      if (active) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }
  }

  async function loadDashboard() {
    if (state.dashboardAbort) {
      state.dashboardAbort.abort();
    }
    const controller = new AbortController();
    state.dashboardAbort = controller;
    const seq = state.dashboardSeq + 1;
    state.dashboardSeq = seq;
    try {
      const response = await fetchImpl(API_DASHBOARD, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (seq !== state.dashboardSeq) {
        return;
      }
      if (!response.ok) {
        throw new Error('dashboard_unavailable');
      }
      state.snapshot = await response.json();
      if (seq !== state.dashboardSeq) {
        return;
      }
      if (els.lastRefreshed) {
        els.lastRefreshed.textContent = `Last refreshed: ${nowIso()}`;
      }
      renderAll();
    } catch (error) {
      if (error && typeof error === 'object' && error.name === 'AbortError') {
        return;
      }
      if (seq !== state.dashboardSeq) {
        return;
      }
      renderLoadError('Could not load dashboard JSON.');
    }
  }

  async function loadHealth() {
    if (state.healthAbort) {
      state.healthAbort.abort();
    }
    const controller = new AbortController();
    state.healthAbort = controller;
    const seq = state.healthSeq + 1;
    state.healthSeq = seq;
    state.healthRequested = true;
    try {
      const response = await fetchImpl(API_HEALTH, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (seq !== state.healthSeq) {
        return;
      }
      if (!response.ok) {
        throw new Error('health_unavailable');
      }
      state.health = await response.json();
      if (seq !== state.healthSeq) {
        return;
      }
      if (state.snapshot) {
        renderHealth(state.snapshot, state.health);
      }
    } catch (error) {
      if (error && typeof error === 'object' && error.name === 'AbortError') {
        return;
      }
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    state.autoRefreshTimer = setIntervalFn(() => {
      void loadDashboard();
    }, AUTO_REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (state.autoRefreshTimer !== null) {
      clearIntervalFn(state.autoRefreshTimer);
      state.autoRefreshTimer = null;
    }
  }

  function bindControls() {
    for (const button of document.querySelectorAll('.nav-btn')) {
      button.addEventListener('click', () => {
        showSection(button.getAttribute('data-section') ?? 'overview');
      });
    }
    if (els.refresh) {
      els.refresh.addEventListener('click', () => {
        void loadDashboard();
      });
    }
    if (els.autoRefresh) {
      els.autoRefresh.addEventListener('change', () => {
        if (els.autoRefresh.checked) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      });
    }
  }

  bindControls();
  showSection('overview');

  return {
    loadDashboard,
    loadHealth,
    startAutoRefresh,
    stopAutoRefresh,
    showSection,
    renderAll,
    getState() {
      return state;
    },
  };
}

function autoBoot() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.querySelector('#refresh') === null) {
    return;
  }
  const app = createDashboardApp({
    document,
    fetch: (input, init) => globalThis.fetch(input, init),
    nowIso: () => new Date().toISOString(),
  });
  void app.loadDashboard();
}

autoBoot();
