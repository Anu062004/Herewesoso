require('dotenv').config();

const express = require('express');
const cors = require('cors');
const healthRoute = require('./routes/health');
const signalsRoute = require('./routes/signals');
const positionsRoute = require('./routes/positions');
const alertsRoute = require('./routes/alerts');
const memosRoute = require('./routes/memos');
const macroRoute = require('./routes/macro');
const risksRoute = require('./routes/risks');
const triggerRoute = require('./routes/trigger');
const testTelegramRoute = require('./routes/testTelegram');
const actionsRoute = require('./routes/actions');
const { startScheduler } = require('./agents/orchestrator');

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

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  startScheduler();
});
