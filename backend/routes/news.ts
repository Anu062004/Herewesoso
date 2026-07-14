import type { Request, Response } from 'express';

import express from 'express';
import sosovalue = require('../services/sosovalue');
import { boundedInteger } from '../utils/validation';

const router = express.Router();

// Simple in-memory cache
const cache = new Map<string, { data: any; expiresAt: number; cachedAt: string }>();

function safeExternalUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

function normalizedDate(value: unknown): string {
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null;
  const date = new Date(numeric !== null ? (numeric < 10_000_000_000 ? numeric * 1000 : numeric) : String(value || ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function textValue(value: unknown, fallback: string, maxLength: number): string {
  const valueAsText = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  return (valueAsText || fallback).slice(0, maxLength);
}

function normalizeArticle(item: any, index: number, prefix: 'news' | 'hot') {
  const publishedValue = item.release_time ?? item.published_at ?? item.publishedAt ?? item.created_at ?? item.date;
  const rawImage = item.feature_image
    || (Array.isArray(item.media_info) ? item.media_info[0]?.soso_url : null)
    || item.image_url
    || item.author_avatar_url;
  return {
    id: textValue(item.id ?? item.news_id, `${prefix}-${index}`, 128),
    title: textValue(item.title ?? item.headline ?? (item.nick_name ? `${item.nick_name} Update` : null), 'Untitled', 300),
    summary: textValue(item.summary ?? item.description ?? item.content, '', 1000),
    source: textValue(item.author ?? item.nick_name ?? item.source ?? item.publisher, 'SoSoValue', 100),
    url: safeExternalUrl(item.source_link ?? item.original_link ?? item.url ?? item.link),
    imageUrl: safeExternalUrl(rawImage),
    publishedAt: normalizedDate(publishedValue),
    category: textValue(item.category ?? item.tag ?? item.sector, prefix === 'hot' ? 'Trending' : 'General', 64),
    sentiment: typeof item.sentiment === 'string' ? item.sentiment.trim().slice(0, 32) || null : null
  };
}

async function getCachedData(key: string, fetchFn: () => Promise<any>, ttlMs = 60000) {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  const data = await fetchFn();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs, cachedAt: new Date().toISOString() });
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((left, right) => left[1].expiresAt - right[1].expiresAt)[0]?.[0];
    if (oldest) cache.delete(oldest);
  }
  return data;
}

// GET /api/news — returns latest crypto news from SoSoValue
router.get('/', async (_req: Request, res: Response) => {
  try {
    const limit = boundedInteger(_req.query.limit, 30, 1, 100);
    const cacheKey = `news_${limit}`;

    const articles = await getCachedData(cacheKey, async () => {
      const newsResult = await sosovalue.getNews(limit);
      return (Array.isArray(newsResult?.data) ? newsResult.data : []).map((item: any, index: number) =>
        normalizeArticle(item, index, 'news')
      );
    }, 60000); // 1 minute cache

    return res.json({
      success: true,
      count: articles.length,
      articles,
      stale: false,
      cachedAt: cache.get(cacheKey)?.cachedAt || null,
    });
  } catch (error: any) {
    console.error('[News Route]', error.message);
    
    // Return stale cache if available when error occurs
    const staleCache = cache.get(`news_${boundedInteger(_req.query.limit, 30, 1, 100)}`);
    if (staleCache) {
      return res.json({
        success: true,
        count: staleCache.data.length,
        articles: staleCache.data,
        stale: true,
        cachedAt: staleCache.cachedAt,
      });
    }

    return res.status(500).json({
      success: false,
      count: 0,
      articles: [],
      error: 'Market news is temporarily unavailable.',
    });
  }
});

// GET /api/news/hot — returns hot/trending news
router.get('/hot', async (_req: Request, res: Response) => {
  try {
    const articles = await getCachedData('hot', async () => {
      const hotResult = await sosovalue.getHotNews();
      const rawData = hotResult?.data;
      return (Array.isArray(rawData) ? rawData : []).map((item: any, index: number) =>
        normalizeArticle(item, index, 'hot')
      );
    }, 60000);

    return res.json({
      success: true,
      count: articles.length,
      articles,
      stale: false,
      cachedAt: cache.get('hot')?.cachedAt || null,
    });
  } catch (error: any) {
    console.error('[Hot News Route]', error.message);
    
    const staleCache = cache.get('hot');
    if (staleCache) {
      return res.json({
        success: true,
        count: staleCache.data.length,
        articles: staleCache.data,
        stale: true,
        cachedAt: staleCache.cachedAt,
      });
    }

    return res.status(500).json({
      success: false,
      count: 0,
      articles: [],
      error: 'Trending news is temporarily unavailable.',
    });
  }
});

// GET /api/news/etf — returns ETF flow data
router.get('/etf', async (_req: Request, res: Response) => {
  try {
    const data = await getCachedData('etf', async () => {
      const [etfFlows, etfSummary] = await Promise.all([
        sosovalue.getETFFlows(),
        sosovalue.getETFSummaryHistory(7),
      ]);
      return {
        flows: etfFlows?.data || [],
        summary: etfSummary?.data || {},
      };
    }, 60000);

    return res.json({
      success: true,
      flows: data.flows,
      summary: data.summary,
      stale: false,
      cachedAt: cache.get('etf')?.cachedAt || null,
    });
  } catch (error: any) {
    console.error('[ETF Route]', error.message);
    const staleCache = cache.get('etf');
    if (staleCache) {
      return res.json({
        success: true,
        flows: staleCache.data.flows,
        summary: staleCache.data.summary,
        stale: true,
        cachedAt: staleCache.cachedAt,
      });
    }
    return res.status(500).json({ success: false, error: 'ETF data is temporarily unavailable.' });
  }
});

// GET /api/news/macro — returns macro economic events
router.get('/macro', async (_req: Request, res: Response) => {
  try {
    const date = String(_req.query.date || '');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, events: [], error: 'date must use YYYY-MM-DD format.' });
    }
    const cacheKey = `macro_${date}`;
    
    const events = await getCachedData(cacheKey, async () => {
      const macroResult = await sosovalue.getMacroEvents(date || undefined);
      return macroResult?.data || [];
    }, 60000);

    return res.json({
      success: true,
      events,
      stale: false,
      cachedAt: cache.get(cacheKey)?.cachedAt || null,
    });
  } catch (error: any) {
    console.error('[Macro Route]', error.message);
    const staleCache = cache.get(`macro_${String(_req.query.date || '')}`);
    if (staleCache) {
      return res.json({
        success: true,
        events: staleCache.data,
        stale: true,
        cachedAt: staleCache.cachedAt,
      });
    }
    return res.status(500).json({ success: false, events: [], error: 'Macro data is temporarily unavailable.' });
  }
});

export = router;
