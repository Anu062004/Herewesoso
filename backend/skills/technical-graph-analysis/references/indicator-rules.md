# Indicator and output rules

## Evidence

- Trend: bullish when latest close > EMA 9 > EMA 21 and, when available, EMA 21 > EMA 50; bearish is the inverse. Otherwise the structure is range-bound.
- Momentum: RSI 14 and MACD histogram. RSI above 70 is extended; below 30 is oversold.
- Volatility: ATR 14 as a percentage of price. ATR percentage is `HIGH` at 5% or more, `ELEVATED` at 2% or more, otherwise `NORMAL`. Bollinger Bands 20/2 are returned as indicators but do not currently change the regime.
- Volume: average of the latest five observations divided by the latest twenty. Values above 1.15 confirm participation; below 0.75 indicate fading participation.
- Levels: low and high of the latest 30 observations, or the available history when fewer than 30.
- Breakout: latest close outside the high/low range of the preceding 20 observations. Breakout classification does not currently require volume confirmation; volume is reported separately.

## Confidence

Start at 45. Add 12 for at least 50 observations (otherwise 4), add 10 for a non-range trend (otherwise subtract 8), add 10 when momentum equals the trend, and add 7 when volume exists (otherwise subtract 6). Subtract 5 per reported conflict and clamp to 25–92. The current confidence formula does not directly penalize extreme volatility.

## Required output

Return: version, symbol, interval, observation count, trend, momentum, volatility regime, breakout state, confidence, full-window change, ATR percentage, volume ratio, support, resistance, invalidation, indicator values, evidence, conflicts, narrative, disclaimer, and calculation time.
