import type { Request, Response } from 'express';

import express from 'express';
import sosovalue = require('../services/sosovalue');

const router = express.Router();

// GET /api/news — returns latest crypto news from SoSoValue
router.get('/', async (_req: Request, res: Response) => {
  try {
    const limit = parseInt(String(_req.query.limit || '30'), 10);
    const newsResult = await sosovalue.getNews(limit);

    const articles = (newsResult?.data || []).map((item: any, index: number) => {
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

    return res.json({
      success: true,
      count: articles.length,
      articles,
    });
  } catch (error: any) {
    console.error('[News Route]', error.message);
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
    const hotResult = await sosovalue.getHotNews();
    const rawData = hotResult?.data;
    const articles = (Array.isArray(rawData) ? rawData : []).map((item: any, index: number) => {
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

    return res.json({
      success: true,
      count: articles.length,
      articles,
    });
  } catch (error: any) {
    console.error('[Hot News Route]', error.message);
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
    const [etfFlows, etfSummary] = await Promise.all([
      sosovalue.getETFFlows(),
      sosovalue.getETFSummaryHistory(7),
    ]);

    return res.json({
      success: true,
      flows: etfFlows?.data || [],
      summary: etfSummary?.data || {},
    });
  } catch (error: any) {
    console.error('[ETF Route]', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/news/macro — returns macro economic events
router.get('/macro', async (_req: Request, res: Response) => {
  try {
    const date = String(_req.query.date || '');
    const macroResult = await sosovalue.getMacroEvents(date || undefined);

    return res.json({
      success: true,
      events: macroResult?.data || [],
    });
  } catch (error: any) {
    console.error('[Macro Route]', error.message);
    return res.status(500).json({ success: false, events: [], error: error.message });
  }
});

export = router;
