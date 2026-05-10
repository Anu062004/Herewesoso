const express = require('express');
const sodex = require('../services/sodex');

const router = express.Router();

/**
 * GET /api/sodex/account
 * Returns full enriched account state: positions with mark prices and
 * liquidation prices filled in, plus account balances and margin info.
 */
router.get('/account', async (req, res) => {
  const wallet = req.query.wallet || process.env.USER_WALLET_ADDRESS;

  if (!wallet) {
    return res.status(400).json({ error: 'No wallet address provided.' });
  }

  try {
    const enriched = await sodex.getEnrichedPositions(wallet);
    return res.json(enriched);
  } catch (error) {
    console.error('[SoDEX Route] /account error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sodex/markets
 * Returns all available perp market symbols with mark prices and funding rates.
 */
router.get('/markets', async (req, res) => {
  try {
    const markPrices = await sodex.getMarkPrices();
    return res.json(markPrices);
  } catch (error) {
    console.error('[SoDEX Route] /markets error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sodex/orderbook/:symbol
 * Returns the orderbook for a specific symbol (e.g., BTC-USD).
 */
router.get('/orderbook/:symbol', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const orderbook = await sodex.getOrderbook(req.params.symbol, limit);
    return res.json(orderbook);
  } catch (error) {
    console.error('[SoDEX Route] /orderbook error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sodex/klines/:symbol
 * Returns kline/candlestick data for a symbol.
 */
router.get('/klines/:symbol', async (req, res) => {
  try {
    const interval = req.query.interval || '1h';
    const limit = parseInt(req.query.limit || '100', 10);
    const klines = await sodex.getKlines(req.params.symbol, interval, limit);
    return res.json(klines);
  } catch (error) {
    console.error('[SoDEX Route] /klines error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
