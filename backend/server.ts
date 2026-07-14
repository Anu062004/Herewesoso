import 'dotenv/config';
import app from './app';
import orchestrator = require('./agents/orchestrator');
import telegramBot = require('./services/telegramBot');
import sodexMarketStream = require('./services/sodexMarketStream');
import { assertProductionEnvironment } from './config/env';

const { startScheduler, stopScheduler } = orchestrator;
const { startBot, stopBot } = telegramBot;

assertProductionEnvironment();

const PORT = Number.parseInt(process.env.PORT || '3001', 10);
const shouldRunScheduler =
  process.env.VERCEL !== '1' && process.env.ENABLE_BACKGROUND_SCHEDULER !== 'false';
const shouldRunTelegramBot =
  process.env.VERCEL !== '1' && process.env.ENABLE_TELEGRAM_BOT === 'true';

const server = app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
  sodexMarketStream.start();
  if (shouldRunScheduler) startScheduler();
  if (shouldRunTelegramBot) startBot();
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received; shutting down.`);
  stopScheduler();
  stopBot();
  sodexMarketStream.stop();
  server.close((error) => {
    if (error) console.error('[Server] Shutdown error:', error.message);
    process.exitCode = error ? 1 : 0;
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
