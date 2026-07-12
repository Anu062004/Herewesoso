# Indicator and output rules

## Evidence

- Trend: EMA 9 above/below EMA 21, with EMA 50 as the medium-term filter.
- Momentum: RSI 14 and MACD histogram. RSI above 70 is extended; below 30 is oversold.
- Volatility: ATR 14 as a percentage of price and Bollinger Band width.
- Volume: average of the latest five observations divided by the latest twenty. Values above 1.15 confirm participation; below 0.75 indicate fading participation.
- Levels: recent 30-observation high and low, plus closest swing zones when available.
- Breakout: latest close outside the prior 20-observation range. Require volume confirmation when volume exists.

## Confidence

Start at 45. Add for sufficient history, EMA agreement, RSI/MACD agreement, and volume confirmation. Subtract for missing volume, conflicting momentum, range structure, fewer than 50 observations, or extreme volatility. Clamp to 25–92.

## Required output

Return: version, symbol, interval, trend, momentum, volatility regime, breakout state, confidence, support, resistance, invalidation, indicator values, evidence, conflicts, narrative, disclaimer, and calculatedAt.
