import type { NarrativeBaseline, NarrativeWeights } from './narrativeEngine';
import { DEFAULT_NARRATIVE_WEIGHTS } from './narrativeEngine';
import supabaseService = require('./supabase');

const { safeSelect } = supabaseService;
const FACTORS: Array<keyof NarrativeWeights> = ['velocity', 'acceleration', 'sourceBreadth', 'sourceQuality', 'catalyst', 'sentiment', 'market'];

export interface StoredNarrativeEvent {
  sector: string;
  source: string;
  cluster_id: string;
  published_at: string;
  sentiment: number;
  catalyst: string;
}

function mean(values: number[]): number { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }

function standardDeviation(values: number[], average: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

export function calculateBaseline(events: StoredNarrativeEvent[], now = Date.now(), days = 30): NarrativeBaseline {
  const hours = days * 24;
  const buckets = Array.from({ length: hours }, () => 0);
  for (const event of events) {
    const timestamp = new Date(event.published_at).getTime();
    const ageHours = Math.floor((now - timestamp) / 3_600_000);
    if (Number.isFinite(ageHours) && ageHours >= 0 && ageHours < hours) buckets[ageHours] += 1;
  }
  const averageHourly = mean(buckets);
  return { averageHourly, standardDeviation: standardDeviation(buckets, averageHourly), sampleHours: buckets.length };
}

export async function loadNarrativeBaselines(sectors: readonly string[]): Promise<Record<string, NarrativeBaseline>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await safeSelect<StoredNarrativeEvent>('narrative_events', (query: any) =>
    query.gte('published_at', since).order('published_at', { ascending: false }).limit(5000)
  );
  return Object.fromEntries(sectors.map((sector) => [sector, calculateBaseline(data.filter((event) => event.sector === sector))]));
}

function correlation(xs: number[], ys: number[]): number {
  if (xs.length < 20 || xs.length !== ys.length) return 0;
  const xMean = mean(xs); const yMean = mean(ys);
  let numerator = 0; let xVariance = 0; let yVariance = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const x = xs[index] - xMean; const y = ys[index] - yMean;
    numerator += x * y; xVariance += x * x; yVariance += y * y;
  }
  return xVariance && yVariance ? numerator / Math.sqrt(xVariance * yVariance) : 0;
}

export async function loadCalibratedWeights(): Promise<{ weights: NarrativeWeights; samples: number; calibrated: boolean }> {
  const { data } = await safeSelect<any>('signal_outcomes', (query: any) =>
    query.not('alpha_24h', 'is', null).order('signal_at', { ascending: false }).limit(500)
  );
  const usable = data.filter((row) => row.score_breakdown && typeof row.alpha_24h === 'number');
  if (usable.length < 50) return { weights: DEFAULT_NARRATIVE_WEIGHTS, samples: usable.length, calibrated: false };
  const target = usable.map((row) => Number(row.alpha_24h));
  const raw = Object.fromEntries(FACTORS.map((factor) => {
    const key = factor === 'sourceBreadth' ? 'sourceBreadth' : factor === 'sourceQuality' ? 'sourceQuality' : factor;
    return [factor, Math.max(0.02, correlation(usable.map((row) => Number(row.score_breakdown[key] || 0)), target))];
  })) as unknown as NarrativeWeights;
  const total = FACTORS.reduce((sum, factor) => sum + raw[factor], 0);
  const weights = Object.fromEntries(FACTORS.map((factor) => [factor, raw[factor] / total])) as unknown as NarrativeWeights;
  return { weights, samples: usable.length, calibrated: true };
}

export async function loadSourceReliability(): Promise<Record<string, number>> {
  const { data } = await safeSelect<any>('narrative_source_performance', (query: any) => query.limit(1000));
  return Object.fromEntries(data.map((row) => [String(row.source || '').toLowerCase(), Number(row.reliability_score || 50)]));
}
