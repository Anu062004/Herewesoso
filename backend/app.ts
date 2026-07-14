import express from 'express';
import cors from 'cors';
import healthRoute = require('./routes/health');
import signalsRoute = require('./routes/signals');
import positionsRoute = require('./routes/positions');
import alertsRoute = require('./routes/alerts');
import memosRoute = require('./routes/memos');
import macroRoute = require('./routes/macro');
import risksRoute = require('./routes/risks');
import triggerRoute = require('./routes/trigger');
import dailySummaryRoute = require('./routes/dailySummary');
import testTelegramRoute = require('./routes/testTelegram');
import actionsRoute = require('./routes/actions');
import analyzeRoute = require('./routes/analyze');
import sodexRoute = require('./routes/sodex');
import newsRoute = require('./routes/news');
import agentRunsRoute = require('./routes/agentRuns');
import performanceRoute = require('./routes/performance');
import executionsRoute = require('./routes/executions');
import narrativePreferencesRoute = require('./routes/narrativePreferences');
import narrativeFeedbackRoute = require('./routes/narrativeFeedback');
import narrativeAskRoute = require('./routes/narrativeAsk');
import indicesRoute = require('./routes/indices');
import { allowedOrigins } from './config/env';
import { rateLimit, requestContext, securityHeaders } from './middleware/security';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(requestContext);
app.use(securityHeaders);
app.use(cors({
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  origin(origin, callback) {
    if (!origin || allowedOrigins().includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  }
}));
app.use(express.json({ limit: '64kb', strict: true }));
app.use(rateLimit({ name: 'api', windowMs: 60_000, max: 300 }));

app.use('/health', healthRoute);
app.use('/api/health', healthRoute);
app.use('/api/agent-runs', agentRunsRoute);
app.use('/api/performance', performanceRoute);
app.use('/api/executions', executionsRoute);
app.use('/api/narrative/preferences', narrativePreferencesRoute);
app.use('/api/narrative/feedback', narrativeFeedbackRoute);
app.use('/api/narrative/ask', narrativeAskRoute);
app.use('/api/signals', signalsRoute);
app.use('/api/positions', positionsRoute);
app.use('/api/alerts', alertsRoute);
app.use('/api/memos', memosRoute);
app.use('/api/macro', macroRoute);
app.use('/api/risks', risksRoute);
app.use('/api/trigger', triggerRoute);
app.use('/api/daily-summary', dailySummaryRoute);
app.use('/api/test-telegram', testTelegramRoute);
app.use('/api/actions', actionsRoute);
app.use('/api/analyze', analyzeRoute);
app.use('/api/sodex', sodexRoute);
app.use('/api/news', newsRoute);
app.use('/api/indices', indicesRoute);

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.', code: 'NOT_FOUND' });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = String(res.locals.requestId || 'unknown');
  const message = error instanceof Error ? error.message : 'Unexpected error';
  console.error(JSON.stringify({ level: 'error', requestId, message }));
  if (res.headersSent) return;
  if (message === 'Origin is not allowed by CORS.') {
    res.status(403).json({ error: 'Request origin is not allowed.', code: 'CORS_ORIGIN_DENIED', requestId });
    return;
  }
  res.status(500).json({ error: 'An unexpected server error occurred.', code: 'INTERNAL_ERROR', requestId });
});

export default app;
