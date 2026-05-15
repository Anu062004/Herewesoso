import type { Request, Response } from 'express';

import express from 'express';
import sosovalue = require('../services/sosovalue');

const router = express.Router();

// GET /api/news — returns latest crypto news from SoSoValue
router.get('/', async (_req: Request, res: Response) => {
  try {
    const limit = parseInt(String(_req.query.limit || '30'), 10);
    const newsResult = await sosovalue.getNews(limit);

    const articles = (newsResult?.data || []).map((item: any, index: number) => ({
      id: item.id || item.news_id || `news-${index}`,
      title: item.title || item.headline || 'Untitled',
      summary: item.summary || item.description || item.content?.slice(0, 200) || '',
      source: item.source || item.publisher || item.provider || 'SoSoValue',
      url: item.url || item.link || item.source_url || null,
      imageUrl: item.image_url || item.thumbnail || item.cover || null,
      publishedAt: item.published_at || item.publishedAt || item.created_at || item.date || new Date().toISOString(),
      category: item.category || item.tag || item.sector || 'General',
      sentiment: item.sentiment || null,
    }));

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
    const articles = (Array.isArray(rawData) ? rawData : []).map((item: any, index: number) => ({
      id: item.id || item.news_id || `hot-${index}`,
      title: item.title || item.headline || 'Untitled',
      summary: item.summary || item.description || item.content?.slice(0, 200) || '',
      source: item.source || item.publisher || 'SoSoValue',
      url: item.url || item.link || null,
      imageUrl: item.image_url || item.thumbnail || item.cover || null,
      publishedAt: item.published_at || item.publishedAt || item.created_at || new Date().toISOString(),
      category: item.category || item.tag || 'Trending',
      sentiment: item.sentiment || null,
    }));

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
