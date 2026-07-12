interface GraphCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface AnalysisInput { symbol: string; interval: string; points: GraphCandle[] }

const round = (value: number | null, digits = 2) => value === null ? null : Number(value.toFixed(digits));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  return values.reduce<number[]>((result, value, index) => {
    result.push(index === 0 ? value : value * multiplier + result[index - 1] * (1 - multiplier));
    return result;
  }, []);
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  const changes = values.slice(-period - 1).slice(1).map((value, index) => value - values.slice(-period - 1)[index]);
  const gains = average(changes.map((value) => Math.max(0, value)));
  const losses = average(changes.map((value) => Math.max(0, -value)));
  return losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
}

function atr(points: GraphCandle[], period = 14): number | null {
  if (points.length <= period) return null;
  const rows = points.slice(-period - 1);
  return average(rows.slice(1).map((point, index) => Math.max(
    point.high - point.low,
    Math.abs(point.high - rows[index].close),
    Math.abs(point.low - rows[index].close)
  )));
}

function standardDeviation(values: number[]) {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function analyzeTechnicalGraph(input: AnalysisInput) {
  const points = input.points
    .filter((point) => [point.time, point.open, point.high, point.low, point.close].every(Number.isFinite) && point.close > 0)
    .sort((a, b) => a.time - b.time);
  if (points.length < 20) throw new Error('At least 20 valid OHLC observations are required.');

  const closes = points.map((point) => point.close);
  const latest = points[points.length - 1];
  const changePct = (latest.close - points[0].open) / points[0].open * 100;
  const previousRange = points.slice(-21, -1);
  const recent = points.slice(-30);
  const ema9 = ema(closes, 9).at(-1)!;
  const ema21 = ema(closes, 21).at(-1)!;
  const ema50 = points.length >= 50 ? ema(closes, 50).at(-1)! : null;
  const macdSeries = ema(closes, 12).map((value, index) => value - ema(closes, 26)[index]);
  const macd = macdSeries.at(-1)!;
  const signal = ema(macdSeries, 9).at(-1)!;
  const histogram = macd - signal;
  const rsi14 = rsi(closes);
  const atr14 = atr(points);
  const atrPct = atr14 === null ? null : atr14 / latest.close * 100;
  const bandValues = closes.slice(-20);
  const bandMean = average(bandValues);
  const bandDeviation = standardDeviation(bandValues);
  const upperBand = bandMean + 2 * bandDeviation;
  const lowerBand = bandMean - 2 * bandDeviation;
  const volumeRows = points.map((point) => point.volume || 0).filter((value) => value > 0);
  const volumeRatio = volumeRows.length >= 5 ? average(volumeRows.slice(-5)) / (average(volumeRows.slice(-20)) || 1) : null;
  const support = Math.min(...recent.map((point) => point.low));
  const resistance = Math.max(...recent.map((point) => point.high));
  const priorHigh = Math.max(...previousRange.map((point) => point.high));
  const priorLow = Math.min(...previousRange.map((point) => point.low));
  const breakout = latest.close > priorHigh ? 'UPSIDE' : latest.close < priorLow ? 'DOWNSIDE' : 'NONE';
  const bullishTrend = latest.close > ema9 && ema9 > ema21 && (ema50 === null || ema21 > ema50);
  const bearishTrend = latest.close < ema9 && ema9 < ema21 && (ema50 === null || ema21 < ema50);
  const trend = bullishTrend ? 'BULLISH' : bearishTrend ? 'BEARISH' : 'RANGE';
  const momentum = histogram > 0 && (rsi14 ?? 50) > 52 ? 'BULLISH' : histogram < 0 && (rsi14 ?? 50) < 48 ? 'BEARISH' : 'NEUTRAL';
  const volatilityRegime = (atrPct || 0) >= 5 ? 'HIGH' : (atrPct || 0) >= 2 ? 'ELEVATED' : 'NORMAL';
  const evidence: string[] = [];
  const conflicts: string[] = [];
  evidence.push(`EMA structure is ${trend.toLowerCase()}.`);
  if (volumeRatio === null) conflicts.push('Volume confirmation is unavailable.');
  else evidence.push(volumeRatio >= 1.15 ? 'Recent volume confirms participation.' : volumeRatio < 0.75 ? 'Recent volume is fading.' : 'Recent volume is near baseline.');
  if (trend !== 'RANGE' && momentum !== trend) conflicts.push('Momentum does not confirm the prevailing EMA structure.');
  if (rsi14 !== null && rsi14 >= 70) conflicts.push('RSI is extended above 70.');
  if (rsi14 !== null && rsi14 <= 30) conflicts.push('RSI is oversold below 30.');
  let confidence = 45 + (points.length >= 50 ? 12 : 4) + (trend !== 'RANGE' ? 10 : -8) + (momentum === trend ? 10 : 0) + (volumeRatio !== null ? 7 : -6) - conflicts.length * 5;
  confidence = Math.round(clamp(confidence, 25, 92));
  const invalidation = trend === 'BULLISH' ? support : trend === 'BEARISH' ? resistance : breakout === 'UPSIDE' ? priorHigh : priorLow;
  const narrative = trend === 'BULLISH'
    ? `The chart has a bullish EMA structure with ${momentum.toLowerCase()} momentum. Support is near ${support.toFixed(2)} and resistance is near ${resistance.toFixed(2)}. A sustained close below ${invalidation.toFixed(2)} would invalidate this structure.`
    : trend === 'BEARISH'
      ? `The chart has a bearish EMA structure with ${momentum.toLowerCase()} momentum. Support is near ${support.toFixed(2)} and resistance is near ${resistance.toFixed(2)}. Recovery above ${invalidation.toFixed(2)} would invalidate this structure.`
      : `The chart is range-bound between approximately ${support.toFixed(2)} and ${resistance.toFixed(2)} with ${momentum.toLowerCase()} momentum. Conviction remains limited until price closes outside the prior range.`;

  return {
    version: 'technical-graph-analysis-v1.0', symbol: input.symbol, interval: input.interval,
    observations: points.length, trend, momentum, volatilityRegime, breakout, confidence,
    changePct: round(changePct), volatilityPct: round(atrPct), volumeRatio: round(volumeRatio),
    support: round(support), resistance: round(resistance), invalidation: round(invalidation),
    indicators: { ema9: round(ema9), ema21: round(ema21), ema50: round(ema50), rsi14: round(rsi14), macd: round(macd, 4), macdSignal: round(signal, 4), macdHistogram: round(histogram, 4), atr14: round(atr14), atrPct: round(atrPct), bollingerUpper: round(upperBand), bollingerMiddle: round(bandMean), bollingerLower: round(lowerBand), volumeRatio: round(volumeRatio) },
    evidence, conflicts, narrative,
    disclaimer: 'Technical chart interpretation only; not investment advice or a prediction guarantee.',
    calculatedAt: new Date().toISOString()
  };
}

function normalizeGraphCandles(raw: any): GraphCandle[] {
  const source = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  const number = (value: unknown) => Number.parseFloat(String(value ?? ''));
  return source.flatMap((row: any) => {
    const values = Array.isArray(row)
      ? { time: row[0], open: row[1], high: row[2], low: row[3], close: row[4], volume: row[5] }
      : { time: row.time ?? row.t ?? row.timestamp ?? row.openTime, open: row.open ?? row.o, high: row.high ?? row.h, low: row.low ?? row.l, close: row.close ?? row.c, volume: row.volume ?? row.v };
    const candle = { time: number(values.time), open: number(values.open), high: number(values.high), low: number(values.low), close: number(values.close), volume: number(values.volume) || 0 };
    return [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) ? [candle] : [];
  });
}

export = { analyzeTechnicalGraph, normalizeGraphCandles };
