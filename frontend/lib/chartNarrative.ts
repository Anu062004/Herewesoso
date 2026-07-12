export interface ChartInputPoint {
  time: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  value?: number;
  volume?: number;
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function analyzeChart(points: ChartInputPoint[]) {
  const rows = points
    .map((point) => ({ ...point, price: point.close ?? point.value ?? 0 }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.time - b.time);
  if (rows.length < 8) return null;

  const prices = rows.map((point) => point.price);
  const returns = prices.slice(1).map((price, index) => (price - prices[index]) / prices[index] * 100);
  const fastWindow = prices.slice(-Math.min(10, prices.length));
  const slowWindow = prices.slice(-Math.min(30, prices.length));
  const fastAverage = average(fastWindow);
  const slowAverage = average(slowWindow);
  const latest = prices[prices.length - 1];
  const first = prices[0];
  const changePct = (latest - first) / first * 100;
  const volatilityPct = Math.sqrt(average(returns.map((value) => value * value)));
  const highs = rows.map((point) => point.high ?? point.price);
  const lows = rows.map((point) => point.low ?? point.price);
  const resistance = Math.max(...highs.slice(-Math.min(30, highs.length)));
  const support = Math.min(...lows.slice(-Math.min(30, lows.length)));
  const volumes = rows.map((point) => point.volume || 0).filter((value) => value > 0);
  const recentVolume = average(volumes.slice(-5));
  const baseVolume = average(volumes.slice(-20)) || recentVolume;
  const volumeRatio = baseVolume ? recentVolume / baseVolume : null;
  const trend = fastAverage > slowAverage * 1.003 ? 'BULLISH' : fastAverage < slowAverage * 0.997 ? 'BEARISH' : 'RANGE';
  const momentum = Math.abs(changePct) > volatilityPct * 3 ? 'STRONG' : Math.abs(changePct) > volatilityPct * 1.5 ? 'MODERATE' : 'WEAK';
  const confirmation = volumeRatio === null ? 'Volume confirmation unavailable' : volumeRatio >= 1.15 ? 'Volume confirms the move' : volumeRatio < 0.75 ? 'Volume is fading' : 'Volume is neutral';
  const confidence = Math.min(90, Math.max(35, 50 + Math.min(rows.length / 5, 20) + (volumeRatio !== null ? 10 : 0) - (trend === 'RANGE' ? 8 : 0)));
  const narrative = trend === 'BULLISH'
    ? `Price is holding above its short and medium averages with ${momentum.toLowerCase()} positive momentum. ${confirmation}. A break above ${resistance.toFixed(2)} would strengthen continuation; losing ${support.toFixed(2)} would invalidate it.`
    : trend === 'BEARISH'
      ? `Price is trading below its short and medium averages with ${momentum.toLowerCase()} downside momentum. ${confirmation}. ${support.toFixed(2)} is the nearest support; recovery above ${resistance.toFixed(2)} would weaken the bearish structure.`
      : `Price is range-bound between approximately ${support.toFixed(2)} and ${resistance.toFixed(2)}. ${confirmation}. Directional conviction is limited until price closes outside this range.`;

  return {
    trend,
    momentum,
    changePct: round(changePct),
    volatilityPct: round(volatilityPct),
    support: round(support),
    resistance: round(resistance),
    volumeRatio: volumeRatio === null ? null : round(volumeRatio),
    confidence: Math.round(confidence),
    narrative,
    disclaimer: 'Technical chart interpretation only; it does not include fundamentals and is not investment advice.'
  };
}
