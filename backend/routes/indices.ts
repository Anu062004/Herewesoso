import type { Request, Response } from 'express';

import express from 'express';
import sosovalue = require('../services/sosovalue');
import errorUtils = require('../utils/error');

const router = express.Router();
const { getErrorMessage } = errorUtils;
const cache = new Map<string, { expiresAt: number; payload: Record<string, unknown> }>();

function cached(key: string) {
  const entry = cache.get(key);
  return entry && entry.expiresAt > Date.now() ? entry.payload : null;
}

function remember(key: string, payload: Record<string, unknown>, ttlMs: number) {
  cache.set(key, { payload, expiresAt: Date.now() + ttlMs });
  return payload;
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rows(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['list', 'items', 'records', 'indices', 'indexes', 'data', 'history', 'points']) {
    const found = rows(value[key]);
    if (found.length) return found;
  }
  return [];
}

function normalizeIndex(item: any, index: number) {
  const symbol = String(item.symbol || item.indexSymbol || item.ticker || item.code || item.name || `SSI-${index + 1}`);
  return {
    id: String(item.id || item.index_id || item.indexId || item.slug || symbol),
    symbol,
    name: String(item.fullName || item.indexName || item.name || symbol),
    price: number(item.price ?? item.indexValue ?? item.value ?? item.nav ?? item.currentPrice),
    change24h: number(item.change24h ?? item.change_24h ?? item.priceChange24h ?? item.ratio24h),
    roi7d: number(item.roi7d ?? item.roi_7d ?? item.change7d),
    roi1m: number(item.roi1m ?? item.roi_1m ?? item.change1m),
    roi3m: number(item.roi3m ?? item.roi_3m ?? item.change3m),
    roi1y: number(item.roi1y ?? item.roi_1y ?? item.change1y),
    ytd: number(item.ytd ?? item.roiYtd ?? item.roi_ytd),
    marketCap: number(item.marketCap ?? item.market_cap),
    description: item.description || item.introduction || null,
    raw: item
  };
}

function normalizePoint(item: any) {
  const rawTime = item.time ?? item.timestamp ?? item.date ?? item.t ?? item.createdAt;
  const timestamp = number(rawTime) ?? (typeof rawTime === 'string' ? Date.parse(rawTime) : null);
  const value = number(item.value ?? item.price ?? item.close ?? item.indexValue ?? item.nav ?? item.c);
  if (timestamp === null || value === null) return null;
  const time = timestamp < 100000000000 ? timestamp * 1000 : timestamp;
  return { time, value };
}

router.get('/', async (_req: Request, res: Response) => {
  const existing = cached('list');
  if (existing) return res.json(existing);
  try {
    const response = await sosovalue.getSSIList();
    const indices = rows(response?.data).map(normalizeIndex);
    return res.json(remember('list', { indices, count: indices.length, updatedAt: new Date().toISOString(), unavailable: indices.length === 0 }, 5 * 60000));
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn('[Indices Route] Index list unavailable:', message);
    return res.json(remember('list', {
      indices: [],
      count: 0,
      updatedAt: new Date().toISOString(),
      unavailable: true,
      message: message.includes('429') ? 'SoSoValue rate limit reached. The index feed will retry automatically.' : message
    }, 60000));
  }
});

router.get('/:identifier/history', async (req: Request, res: Response) => {
  const identifier = String(req.params.identifier || '').trim();
  const days = Math.min(365, Math.max(7, Number.parseInt(String(req.query.days || 90), 10) || 90));
  if (!identifier) return res.status(400).json({ error: 'Index identifier is required.', points: [] });
  const cacheKey = `history:${identifier}:${days}`;
  const existing = cached(cacheKey);
  if (existing) return res.json(existing);
  try {
    const response = await sosovalue.getSSIHistory(identifier, days);
    const points = rows(response?.data).map(normalizePoint).filter(Boolean).sort((a: any, b: any) => a.time - b.time);
    return res.json(remember(cacheKey, { identifier, days, points, updatedAt: new Date().toISOString(), unavailable: points.length === 0 }, 5 * 60000));
  } catch (error) {
    const message = getErrorMessage(error);
    console.warn(`[Indices Route] History unavailable for ${identifier}:`, message);
    return res.json(remember(cacheKey, {
      identifier,
      days,
      points: [],
      updatedAt: new Date().toISOString(),
      unavailable: true,
      message: message.includes('429') ? 'SoSoValue rate limit reached. Index history will retry automatically.' : message
    }, 60000));
  }
});

export = router;
