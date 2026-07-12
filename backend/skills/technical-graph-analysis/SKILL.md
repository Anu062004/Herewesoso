---
name: technical-graph-analysis
description: Analyse crypto candlestick or index charts using deterministic price, volume, volatility, trend, momentum, support, resistance, and risk evidence. Use when producing a graph narrative, technical market structure summary, breakout assessment, invalidation level, or chart-based risk explanation from OHLCV data.
---

# Technical Graph Analysis

Analyse only the supplied time series. Never invent missing price, volume, or indicator evidence.

## Workflow

1. Validate and sort at least 20 OHLCV or index-value points chronologically.
2. Compute trend from EMA 9, EMA 21, and EMA 50 where available.
3. Compute RSI 14, MACD 12/26/9, ATR 14, Bollinger Bands 20/2, range returns, realized volatility, and recent/base volume ratio.
4. Identify support and resistance from recent swing extrema. Treat these as zones, not exact guarantees.
5. Classify structure as bullish, bearish, or range only when multiple indicators agree.
6. State volume confirmation, volatility regime, breakout status, nearest invalidation, and conflicting evidence.
7. Reduce confidence for short history, missing volume, high indicator conflict, or range-bound structure.
8. Return structured evidence and a short narrative. Do not return direct buy/sell instructions or certainty claims.

Read [references/indicator-rules.md](references/indicator-rules.md) when modifying indicator thresholds or the output contract.

## Guardrails

- Label analysis with the symbol, interval, observation count, and calculation time.
- Treat index anchor snapshots differently from continuous candles.
- Say when volume is unavailable.
- Keep confidence between 0 and 100; confidence measures evidence agreement, not future accuracy.
- Include an invalidation condition and technical-analysis disclaimer.
