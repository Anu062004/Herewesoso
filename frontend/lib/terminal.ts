import type {
  AlertRow,
  AlertSeverity,
  LivePosition,
  MacroEvent,
  MemoRow,
  PositionSnapshot,
  PositionsResponse,
  RiskLevel,
  SignalRow
} from '@/lib/types';

import { numeric } from '@/lib/format';

export function latestSignalsBySector(signals: SignalRow[]): SignalRow[] {
  const ordered = [...signals].sort((left, right) => {
    const leftTime = new Date(left.created_at || 0).getTime();
    const rightTime = new Date(right.created_at || 0).getTime();

    if (rightTime !== leftTime) {
      return rightTime - leftTime;
    }

    return right.combined_score - left.combined_score;
  });

  const seen = new Map<string, SignalRow>();

  for (const signal of ordered) {
    if (!seen.has(signal.sector)) {
      seen.set(signal.sector, signal);
    }
  }

  return [...seen.values()].sort((left, right) => right.combined_score - left.combined_score);
}

export function latestRiskBySymbol(history: PositionSnapshot[]) {
  const map = new Map<string, PositionSnapshot>();

  [...history]
    .sort((left, right) => {
      return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    })
    .forEach((snapshot) => {
      if (!map.has(snapshot.symbol)) {
        map.set(snapshot.symbol, snapshot);
      }
    });

  return map;
}

export function fallbackLivePositions(history: PositionSnapshot[]): LivePosition[] {
  const latest = latestRiskBySymbol(history);

  return [...latest.values()].map((snapshot) => ({
    symbol: snapshot.symbol,
    entryPrice: snapshot.entry_price,
    markPrice: snapshot.mark_price,
    liquidationPrice: snapshot.liquidation_price,
    leverage: snapshot.leverage,
    size: snapshot.position_size,
    positionSide: snapshot.position_size < 0 ? 'SHORT' : 'LONG',
    marginMode: 'CROSS'
  }));
}

export function resolvePositions(response: PositionsResponse) {
  const fallbackActive = response.live === null;
  const positions = fallbackActive ? fallbackLivePositions(response.history) : response.live?.positions || [];

  return {
    positions,
    fallbackActive
  };
}

export function computeDistancePercent(input: Pick<LivePosition, 'markPrice' | 'liquidationPrice'>): number {
  const mark = numeric(input.markPrice) || 0;
  const liquidation = numeric(input.liquidationPrice) || 0;

  if (!mark || !liquidation) {
    return 0;
  }

  return Math.max(0, (Math.abs(mark - liquidation) / mark) * 100);
}

export function scoreFromDistance(distance: number): number {
  if (distance >= 25) {
    return 18;
  }

  if (distance >= 20) {
    return 32;
  }

  if (distance >= 10) {
    return 58;
  }

  if (distance >= 5) {
    return 76;
  }

  return 92;
}

export function riskLevelFromDistance(distance: number): RiskLevel {
  if (distance > 20) {
    return 'SAFE';
  }

  if (distance > 10) {
    return 'CAUTION';
  }

  if (distance > 5) {
    return 'DANGER';
  }

  return 'CRITICAL';
}

export function riskLabel(input: { distance?: number; riskLevel?: RiskLevel | null; riskScore?: number | null }) {
  const level = input.riskLevel || riskLevelFromDistance(input.distance || 0);

  if (level === 'SAFE') {
    return { label: 'Safe', tone: 'green' as const };
  }

  if (level === 'CAUTION') {
    return { label: 'Warning', tone: 'amber' as const };
  }

  return { label: 'Critical', tone: 'red' as const };
}

export function highestRiskSummary(response: PositionsResponse) {
  const latest = latestRiskBySymbol(response.history);

  let current: { label: 'Safe' | 'Warning' | 'Critical'; tone: 'green' | 'amber' | 'red' } = {
    label: 'Safe',
    tone: 'green'
  };

  for (const snapshot of latest.values()) {
    const next = riskLabel({
      distance: snapshot.distance_to_liquidation_pct,
      riskLevel: snapshot.risk_level,
      riskScore: snapshot.risk_score
    });

    if (next.tone === 'red') {
      return { label: 'Critical', tone: 'red' as const };
    }

    if (next.tone === 'amber') {
      current = { label: 'Warning', tone: 'amber' };
    }
  }

  return current;
}

export function getTrendLabel(score: number): string {
  if (score >= 70) {
    return 'Expansion';
  }

  if (score >= 40) {
    return 'Balanced';
  }

  return 'Contracting';
}

export function getSignalDirection(value: number) {
  if (value >= 60) {
    return { arrow: '↑', tone: 'green' as const };
  }

  if (value <= 39) {
    return { arrow: '↓', tone: 'red' as const };
  }

  return { arrow: '→', tone: 'amber' as const };
}

export function alertTone(severity: AlertSeverity) {
  if (severity === 'CRITICAL' || severity === 'DANGER') {
    return 'red' as const;
  }

  if (severity === 'WARNING') {
    return 'amber' as const;
  }

  return 'cyan' as const;
}

export function alertSourceLabel(type: AlertRow['alert_type']): string {
  switch (type) {
    case 'LIQUIDATION_RISK':
      return 'Liquidation Shield';
    case 'MACRO_EVENT':
      return 'Macro';
    case 'POSITION_EXIT':
      return 'Positions';
    default:
      return 'Narrative Scanner';
  }
}

export function unreadAlertCount(alerts: AlertRow[]) {
  return alerts.length;
}

export function isUnreadAlert(alert: AlertRow) {
  const createdAt = alert.created_at ? new Date(alert.created_at).getTime() : 0;

  if (!createdAt) {
    return false;
  }

  return Date.now() - createdAt < 30 * 60 * 1000;
}

export function eventTimestamp(event: MacroEvent): string | null {
  const raw = event.eventTime || event.releaseDate || [event.date, event.time].filter(Boolean).join(' ');

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function sortMacroEvents(events: MacroEvent[]) {
  return [...events].sort((left, right) => {
    const leftTime = new Date(eventTimestamp(left) || 0).getTime();
    const rightTime = new Date(eventTimestamp(right) || 0).getTime();
    return leftTime - rightTime;
  });
}

export function macroImpact(event: MacroEvent) {
  const value = String(event.importance || '').toLowerCase();

  if (value.includes('high') || value.includes('3') || value.includes('red')) {
    return 'High';
  }

  if (value.includes('medium') || value.includes('2') || value.includes('amber')) {
    return 'Medium';
  }

  return 'Low';
}

export function cryptoSensitivity(event: MacroEvent) {
  const impact = macroImpact(event);

  if (impact === 'High') {
    return 'High beta';
  }

  if (impact === 'Medium') {
    return 'Elevated';
  }

  return 'Contained';
}

export function memoSector(memo: MemoRow): string {
  const sector = memo.data?.sector;

  if (typeof sector === 'string' && sector.trim()) {
    return sector;
  }

  return memo.related_symbol || 'General';
}

export function memoScore(memo: MemoRow): number | null {
  const candidates = [
    memo.data?.combinedScore,
    memo.data?.combined_score,
    memo.data?.riskScore,
    memo.data?.risk_score
  ];

  for (const candidate of candidates) {
    const parsed = numeric(candidate);

    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

export function memoTitle(memo: MemoRow): string {
  const [firstLine] = memo.content.split('\n').filter(Boolean);

  if (firstLine) {
    return firstLine.slice(0, 80);
  }

  switch (memo.memo_type) {
    case 'ENTRY_SIGNAL':
      return 'Narrative setup';
    case 'RISK_ALERT':
      return 'Risk memo';
    case 'EXIT_SIGNAL':
      return 'Exit memo';
    default:
      return 'Cycle summary';
  }
}

export function memoBody(memo: MemoRow): string {
  return memo.content.replace(/\s+/g, ' ').trim();
}

export function parseRunSummary(summary: unknown): Record<string, unknown> | null {
  if (!summary) {
    return null;
  }

  if (typeof summary === 'string') {
    try {
      return JSON.parse(summary) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (typeof summary === 'object') {
    return summary as Record<string, unknown>;
  }

  return null;
}

export function positionStatus(distance: number) {
  return distance > 20
    ? { label: 'Open', tone: 'green' as const }
    : { label: 'Warning', tone: 'amber' as const };
}
