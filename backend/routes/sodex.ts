import type { Request, Response } from 'express';

import express from 'express';
import sodex = require('../services/sodex');
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

const VALID_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

const router = express.Router();

function getWallet(req: Request): string | null {
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.trim() : process.env.USER_WALLET_ADDRESS;
  return wallet || null;
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseSymbol(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const symbol = value.trim().toUpperCase();
  return symbol || null;
}

function parseInterval(value: unknown): string {
  if (typeof value !== 'string') {
    return '1h';
  }

  return VALID_INTERVALS.has(value) ? value : '1h';
}

router.get('/account', async (req: Request, res: Response) => {
  const wallet = getWallet(req);

  if (!wallet) {
    return res.status(400).json({ error: 'No wallet address provided.' });
  }

  try {
    const enriched = await sodex.getEnrichedPositions(wallet);
    return res.json(enriched);
  } catch (error) {
    console.error('[SoDEX Route] /account error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/markets', async (req: Request, res: Response) => {
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : null;

  try {
    const markPrices = await sodex.getMarkPrices(symbol);
    return res.json(markPrices);
  } catch (error) {
    console.error('[SoDEX Route] /markets error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/orderbook/:symbol', async (req: Request, res: Response) => {
  const symbol = parseSymbol(req.params.symbol);

  if (!symbol) {
    return res.status(400).json({ error: 'A valid symbol is required.' });
  }

  try {
    const limit = parseLimit(req.query.limit, 20, 100);
    const orderbook = await sodex.getOrderbook(symbol, limit);
    return res.json(orderbook);
  } catch (error) {
    console.error('[SoDEX Route] /orderbook error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/klines/:symbol', async (req: Request, res: Response) => {
  const symbol = parseSymbol(req.params.symbol);

  if (!symbol) {
    return res.status(400).json({ error: 'A valid symbol is required.' });
  }

  try {
    const interval = parseInterval(req.query.interval);
    const limit = parseLimit(req.query.limit, 100, 500);
    const klines = await sodex.getKlines(symbol, interval, limit);
    return res.json(klines);
  } catch (error) {
    console.error('[SoDEX Route] /klines error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

export = router;
