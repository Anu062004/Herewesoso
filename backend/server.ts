import 'dotenv/config';
import app from './app';
import orchestrator = require('./agents/orchestrator');
import telegramBot = require('./services/telegramBot');

const { startScheduler } = orchestrator;
const { startBot } = telegramBot;

const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const shouldRunScheduler =
  process.env.VERCEL !== '1' && process.env.ENABLE_BACKGROUND_SCHEDULER !== 'false';

app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  if (shouldRunScheduler) {
    startScheduler();
    startBot();
  }
});
