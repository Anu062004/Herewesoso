import 'dotenv/config';
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
import testTelegramRoute = require('./routes/testTelegram');
import actionsRoute = require('./routes/actions');
import sodexRoute = require('./routes/sodex');
import orchestrator = require('./agents/orchestrator');

const { startScheduler } = orchestrator;

const app = express();

app.use(cors());
app.use(express.json());

app.use('/health', healthRoute);
app.use('/api/signals', signalsRoute);
app.use('/api/positions', positionsRoute);
app.use('/api/alerts', alertsRoute);
app.use('/api/memos', memosRoute);
app.use('/api/macro', macroRoute);
app.use('/api/risks', risksRoute);
app.use('/api/trigger', triggerRoute);
app.use('/api/test-telegram', testTelegramRoute);
app.use('/api/actions', actionsRoute);
app.use('/api/sodex', sodexRoute);

const PORT = Number.parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  startScheduler();
});
