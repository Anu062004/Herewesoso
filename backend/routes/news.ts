import type { Request, Response } from 'express';

import express from 'express';
import sosovalue = require('../services/sosovalue');

const router = express.Router();

// Simple in-memory cache
const cache = new Map<string, { data: any; expiresAt: number }>();

async function getCachedData(key: string, fetchFn: () => Promise<any>, ttlMs = 60000) {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  const data = await fetchFn();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// GET /api/news — returns latest crypto news from SoSoValue
router.get('/', async (_req: Request, res: Response) => {
  try {
    const limit = parseInt(String(_req.query.limit || '30'), 10);
    const cacheKey = `news_${limit}`;

    const articles = await getCachedData(cacheKey, async () => {
      const newsResult = await sosovalue.getNews(limit);
      return (newsResult?.data || []).map((item: any, index: number) => {
        let publishedAtStr = new Date().toISOString();
        if (item.release_time) {
          publishedAtStr = new Date(parseInt(item.release_time, 10)).toISOString();
        } else if (item.published_at || item.publishedAt || item.created_at || item.date) {
          publishedAtStr = item.published_at || item.publishedAt || item.created_at || item.date;
        }

        const imageUrl = item.feature_image || (item.media_info && item.media_info.length > 0 ? item.media_info[0].soso_url : null) || item.image_url || item.author_avatar_url || null;
        const title = item.title || item.headline || (item.nick_name ? `${item.nick_name} Update` : 'Untitled');
        const url = item.source_link || item.original_link || item.url || item.link || null;
        const source = item.author || item.nick_name || item.source || item.publisher || 'SoSoValue';
        const summary = item.summary || item.description || (item.content ? item.content.slice(0, 200) : '');
        const category = item.category || item.tag || item.sector || 'General';

        return {
          id: item.id || item.news_id || `news-${index}`,
          title,
          summary,
          source,
          url,
          imageUrl,
          publishedAt: publishedAtStr,
          category,
          sentiment: item.sentiment || null,
        };
      });
    }, 60000); // 1 minute cache

    return res.json({
      success: true,
      count: articles.length,
      articles,
    });
  } catch (error: any) {
    console.error('[News Route]', error.message);
    
    // Return stale cache if available when error occurs
    const staleCache = cache.get(`news_${parseInt(String(_req.query.limit || '30'), 10)}`);
    if (staleCache) {
      return res.json({
        success: true,
        count: staleCache.data.length,
        articles: staleCache.data,
      });
    }

    return res.status(500).json({
      success: false,
      count: 0,
      articles: [],
      error: error.message,
    });
  }
});

// GET /api/news/hot — returns hot/trending news
router.get('/hot', async (_req: Request, res: Response) => {
  try {
    const articles = await getCachedData('hot', async () => {
      const hotResult = await sosovalue.getHotNews();
      const rawData = hotResult?.data;
      return (Array.isArray(rawData) ? rawData : []).map((item: any, index: number) => {
        let publishedAtStr = new Date().toISOString();
        if (item.release_time) {
          publishedAtStr = new Date(parseInt(item.release_time, 10)).toISOString();
        } else if (item.published_at || item.publishedAt || item.created_at || item.date) {
          publishedAtStr = item.published_at || item.publishedAt || item.created_at || item.date;
        }

        const imageUrl = item.feature_image || (item.media_info && item.media_info.length > 0 ? item.media_info[0].soso_url : null) || item.image_url || item.author_avatar_url || null;
        const title = item.title || item.headline || (item.nick_name ? `${item.nick_name} Update` : 'Untitled');
        const url = item.source_link || item.original_link || item.url || item.link || null;
        const source = item.author || item.nick_name || item.source || item.publisher || 'SoSoValue';
        const summary = item.summary || item.description || (item.content ? item.content.slice(0, 200) : '');
        const category = item.category || item.tag || 'Trending';

        return {
          id: item.id || item.news_id || `hot-${index}`,
          title,
          summary,
          source,
          url,
          imageUrl,
          publishedAt: publishedAtStr,
          category,
          sentiment: item.sentiment || null,
        };
      });
    }, 60000);

    return res.json({
      success: true,
      count: articles.length,
      articles,
    });
  } catch (error: any) {
    console.error('[Hot News Route]', error.message);
    
    const staleCache = cache.get('hot');
    if (staleCache) {
      return res.json({
        success: true,
        count: staleCache.data.length,
        articles: staleCache.data,
      });
    }

    return res.status(500).json({
      success: false,
      count: 0,
      articles: [],
      error: error.message,
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
    });
  } catch (error: any) {
    console.error('[ETF Route]', error.message);
    const staleCache = cache.get('etf');
    if (staleCache) {
      return res.json({
        success: true,
        flows: staleCache.data.flows,
        summary: staleCache.data.summary,
      });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/news/macro — returns macro economic events
router.get('/macro', async (_req: Request, res: Response) => {
  try {
    const date = String(_req.query.date || '');
    const cacheKey = `macro_${date}`;
    
    const events = await getCachedData(cacheKey, async () => {
      const macroResult = await sosovalue.getMacroEvents(date || undefined);
      return macroResult?.data || [];
    }, 60000);

    return res.json({
      success: true,
      events,
    });
  } catch (error: any) {
    console.error('[Macro Route]', error.message);
    const staleCache = cache.get(`macro_${String(_req.query.date || '')}`);
    if (staleCache) {
      return res.json({
        success: true,
        events: staleCache.data,
      });
    }
    return res.status(500).json({ success: false, events: [], error: error.message });
  }
});

export = router;
