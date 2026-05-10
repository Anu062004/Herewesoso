import axios from 'axios';
import sodex = require('./sodex');
import sosovalue = require('./sosovalue');
import riskCalculator = require('../utils/riskCalculator');

type InlineButton = { text: string; callback_data: string };
type InlineKeyboard = { inline_keyboard: InlineButton[][] };

const WALLET = process.env.USER_WALLET_ADDRESS || '';
const ALERT_THRESHOLD = parseInt(process.env.RISK_ALERT_THRESHOLD || '65', 10);
const HIGH_IMPACT = ['CPI', 'FOMC', 'Federal Reserve', 'GDP', 'NFP', 'Jobs', 'PCE'];

let offset = 0;
let polling = false;

function apiBase(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? `https://api.telegram.org/bot${token}` : null;
}

function authorizedChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

// ── Low-level send helpers ──────────────────────────────────────────────────

async function sendMessage(chatId: string | number, text: string, keyboard: InlineKeyboard | null = null) {
  const base = apiBase();
  if (!base) return;

  const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
  if (keyboard) body.reply_markup = keyboard;

  try {
    await axios.post(`${base}/sendMessage`, body);
  } catch (err: any) {
    console.error(`[TelegramBot] sendMessage failed: ${err.message}`);
  }
}

async function editMessage(chatId: string | number, messageId: number, text: string, keyboard: InlineKeyboard | null = null) {
  const base = apiBase();
  if (!base) return;

  const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true };
  if (keyboard) body.reply_markup = keyboard;

  try {
    await axios.post(`${base}/editMessageText`, body);
  } catch (err: any) {
    console.error(`[TelegramBot] editMessage failed: ${err.message}`);
  }
}

async function answerCallback(callbackQueryId: string, text = '') {
  const base = apiBase();
  if (!base) return;
  try {
    await axios.post(`${base}/answerCallbackQuery`, { callback_query_id: callbackQueryId, text });
  } catch { /* silent */ }
}

// ── Keyboards ───────────────────────────────────────────────────────────────

const MAIN_MENU: InlineKeyboard = {
  inline_keyboard: [
    [{ text: 'Positions', callback_data: 'cmd_positions' }, { text: 'Risk', callback_data: 'cmd_risk' }],
    [{ text: 'Signals', callback_data: 'cmd_signals' }, { text: 'Alerts', callback_data: 'cmd_alerts' }],
    [{ text: 'Macro Events', callback_data: 'cmd_macro' }, { text: 'Status', callback_data: 'cmd_status' }],
    [{ text: 'Buy', callback_data: 'cmd_buy' }, { text: 'Sell', callback_data: 'cmd_sell' }],
    [{ text: 'Help', callback_data: 'cmd_help' }]
  ]
};

function backMenu(): InlineKeyboard {
  return { inline_keyboard: [[{ text: 'Back to Menu', callback_data: 'cmd_menu' }]] };
}

function positionActionKeyboard(symbol: string): InlineKeyboard {
  const safe = symbol.replace(/[^A-Za-z0-9-]/g, '_');
  return {
    inline_keyboard: [
      [{ text: 'Close Position', callback_data: `action_close_${safe}` }, { text: 'Reduce Leverage', callback_data: `action_reduce_${safe}` }],
      [{ text: 'Refresh', callback_data: 'cmd_positions' }, { text: 'Back to Menu', callback_data: 'cmd_menu' }]
    ]
  };
}

// ── Message builders ────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function riskBar(score: number): string {
  const filled = Math.round(score / 10);
  return '[' + '|'.repeat(filled) + '-'.repeat(10 - filled) + ']';
}

async function buildPositionsMessage(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: 'USER_WALLET_ADDRESS is not configured.', keyboard: backMenu() };

  try {
    const { positions, accountState } = await sodex.getEnrichedPositions(WALLET);

    if (!positions || positions.length === 0) {
      return { text: 'No open positions found.', keyboard: backMenu() };
    }

    const account = accountState as any;
    const lines: string[] = [
      'OPEN POSITIONS',
      '',
      `Account Value : $${fmt(account?.accountValue || 0)}`,
      `Available Margin: $${fmt(account?.availableMargin || 0)}`,
      ''
    ];

    const macroRaw = await sosovalue.getMacroEvents().catch(() => ({ data: [] }));
    const macro = (macroRaw?.data || []) as any[];

    for (const pos of positions) {
      const mark = parseFloat(String(pos.markPrice || pos.entryPrice || 0));
      const liq = parseFloat(String(pos.liquidationPrice || 0));
      const entry = parseFloat(String(pos.entryPrice || 0));
      const leverage = parseFloat(String(pos.leverage || 0));
      const side = pos.positionSide || pos.side || 'LONG';
      const distPct = riskCalculator.calculateLiquidationDistance(mark, liq, side);
      const riskScore = riskCalculator.distanceToRiskScore(distPct);
      const riskLevel = riskCalculator.scoreToRiskLevel(riskScore);
      const pnl = side === 'SHORT' ? (entry - mark) * parseFloat(String(pos.positionSize || 0)) : (mark - entry) * parseFloat(String(pos.positionSize || 0));

      lines.push(`Symbol   : ${pos.symbol}`);
      lines.push(`Side     : ${side}  |  Leverage: ${leverage}x`);
      lines.push(`Entry    : $${fmt(entry, 0)}  |  Mark: $${fmt(mark, 0)}`);
      lines.push(`Liq Price: $${fmt(liq, 0)}`);
      lines.push(`Dist Liq : ${fmt(distPct)}%`);
      lines.push(`PnL      : ${pnl >= 0 ? '+' : ''}$${fmt(pnl)}`);
      lines.push(`Risk     : ${riskLevel} (${riskScore}/100) ${riskBar(riskScore)}`);
      lines.push('');
    }

    const firstSymbol = positions[0].symbol as string;
    return { text: lines.join('\n'), keyboard: positionActionKeyboard(firstSymbol) };
  } catch (err: any) {
    return { text: `Failed to fetch positions: ${err.message}`, keyboard: backMenu() };
  }
}

async function buildRiskMessage(): Promise<string> {
  if (!WALLET) return 'USER_WALLET_ADDRESS is not configured.';

  try {
    const { positions } = await sodex.getEnrichedPositions(WALLET);
    if (!positions || positions.length === 0) return 'No open positions to assess.';

    const macroRaw = await sosovalue.getMacroEvents().catch(() => ({ data: [] }));
    const macro = (macroRaw?.data || []) as any[];
    const dangerous = macro.filter(e => HIGH_IMPACT.some(k => String(e?.name || '').includes(k)));

    const lines = ['RISK SNAPSHOT', ''];

    for (const pos of positions) {
      const mark = parseFloat(String(pos.markPrice || pos.entryPrice || 0));
      const liq = parseFloat(String(pos.liquidationPrice || 0));
      const side = pos.positionSide || pos.side || 'LONG';
      const leverage = parseFloat(String(pos.leverage || 0));
      const distPct = riskCalculator.calculateLiquidationDistance(mark, liq, side);
      const posRisk = riskCalculator.distanceToRiskScore(distPct);

      let nearestHours = Infinity;
      let nearestEvent = '';
      for (const ev of dangerous) {
        const ts = ev.eventTime || ev.releaseDate || ev.date;
        if (!ts) continue;
        const h = (new Date(ts).getTime() - Date.now()) / 3600000;
        if (h > 0 && h < nearestHours) { nearestHours = h; nearestEvent = ev.name || ''; }
      }

      const macroThreat = isFinite(nearestHours) ? riskCalculator.assessMacroThreat(nearestHours, 5) : 0;
      const combined = riskCalculator.calculateCombinedRisk(posRisk, macroThreat, false);
      const level = riskCalculator.scoreToRiskLevel(combined);
      const action = riskCalculator.suggestAction(level, leverage, distPct);

      lines.push(`${pos.symbol}`);
      lines.push(`Risk     : ${level} ${riskBar(combined)} ${combined}/100`);
      lines.push(`Liq Dist : ${fmt(distPct)}%`);
      lines.push(`Leverage : ${leverage}x`);
      if (nearestEvent) lines.push(`Macro    : ${nearestEvent} in ${fmt(nearestHours, 1)}h`);
      lines.push(`Action   : ${action}`);
      if (combined >= ALERT_THRESHOLD) lines.push('*** HIGH RISK - REVIEW NOW ***');
      lines.push('');
    }

    return lines.join('\n');
  } catch (err: any) {
    return `Failed to assess risk: ${err.message}`;
  }
}

async function buildSignalsMessage(): Promise<string> {
  try {
    const news = await sosovalue.getNews(50).catch(() => ({ data: [] }));
    const etfRaw = await sosovalue.getETFSummaryHistory(7).catch(() => ({ data: { netFlow7Day: 0 } }));
    const macroRaw = await sosovalue.getMacroEvents().catch(() => ({ data: [] }));

    const narrativeScorer = require('../utils/narrativeScorer');
    const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'];
    const headlines = (news?.data || []) as any[];
    const etf = (etfRaw?.data as any)?.netFlow7Day ?? 0;
    const upcoming = (macroRaw?.data || []) as any[];

    const scores = SECTORS.map(sector => {
      const n = narrativeScorer.scoreNarrativeLayer(headlines, sector);
      const e = narrativeScorer.scoreETFLayer(etf);
      const m = narrativeScorer.scoreMacroLayer(upcoming);
      const { combined, signal } = narrativeScorer.generateSignal(n, e, m);
      return { sector, combined, signal };
    }).sort((a: any, b: any) => b.combined - a.combined);

    const lines = ['NARRATIVE SIGNALS', ''];
    for (const s of scores) {
      const bar = riskBar(s.combined);
      lines.push(`${s.sector.padEnd(8)} ${s.signal.padEnd(12)} ${s.combined}/100 ${bar}`);
    }
    lines.push('');
    lines.push(`ETF 7d Flow: $${Number(etf).toLocaleString()}`);
    lines.push(`Macro events: ${upcoming.length}`);

    return lines.join('\n');
  } catch (err: any) {
    return `Failed to fetch signals: ${err.message}`;
  }
}

async function buildMacroMessage(): Promise<string> {
  try {
    const raw = await sosovalue.getMacroEvents();
    const events = (raw?.data || []) as any[];

    if (!events.length) return 'No macro events found for the next 48 hours.';

    const lines = ['MACRO CALENDAR', ''];
    for (const ev of events.slice(0, 10)) {
      const ts = ev.eventTime || ev.releaseDate || ev.date || '';
      const hoursAway = ts ? ((new Date(ts).getTime() - Date.now()) / 3600000).toFixed(1) : '?';
      const flag = HIGH_IMPACT.some(k => String(ev.name || '').includes(k)) ? ' *** HIGH IMPACT' : '';
      lines.push(`${String(ev.name || 'Unknown').padEnd(30)} ${hoursAway}h away${flag}`);
    }

    return lines.join('\n');
  } catch (err: any) {
    return `Failed to fetch macro events: ${err.message}`;
  }
}

async function buildStatusMessage(): Promise<string> {
  const lines = [
    'SYSTEM STATUS',
    '',
    `Server     : Running`,
    `AI Service : ${(process.env.AI_SERVICE || 'claude').toUpperCase()}`,
    `AI Model   : ${process.env.GEMINI_MODEL || process.env.ANTHROPIC_MODEL || 'default'}`,
    `Scheduler  : Every ${Math.round(parseInt(process.env.CYCLE_INTERVAL_MS || '1800000') / 60000)} minutes`,
    `Wallet     : ${WALLET ? WALLET.slice(0, 10) + '...' : 'Not set'}`,
    `Supabase   : ${process.env.SUPABASE_URL?.startsWith('http') ? 'Connected' : 'Not configured'}`,
    `Telegram   : Active`,
    `Auto Trade : ${process.env.AUTO_EXECUTE === 'true' ? 'ENABLED' : 'Disabled'}`,
    '',
    `Time (UTC) : ${new Date().toUTCString()}`
  ];
  return lines.join('\n');
}

function buildHelpMessage(): string {
  return [
    'SENTINEL FINANCE BOT',
    '',
    'Commands:',
    '/menu      - Main menu',
    '/positions - Open positions + P&L',
    '/risk      - Risk assessment',
    '/signals   - Narrative sector signals',
    '/alerts    - Recent alerts',
    '/macro     - Upcoming macro events',
    '/buy       - Queue a buy action',
    '/sell      - Queue a sell action',
    '/status    - System status',
    '/help      - This message',
    '',
    'You also receive automatic alerts every 30 minutes when risk is detected.'
  ].join('\n');
}

function buildBuyMessage(): string {
  return [
    'BUY ORDER',
    '',
    'Reply with the format:',
    'BUY [SYMBOL] [SIZE] [LEVERAGE]x',
    '',
    'Example:',
    'BUY BTC-USD 0.01 10x',
    '',
    'Your order will be queued and executed via EIP-712 (Wave 2).',
    'Check /positions after submitting to confirm.'
  ].join('\n');
}

function buildSellMessage(): string {
  return [
    'SELL / CLOSE ORDER',
    '',
    'Reply with the format:',
    'SELL [SYMBOL] [SIZE]',
    '',
    'Example:',
    'SELL BTC-USD 0.01',
    '',
    'To close a full position use the Close button on /positions.',
    'Your order will be queued and executed via EIP-712 (Wave 2).'
  ].join('\n');
}

// ── Action queuer ───────────────────────────────────────────────────────────

async function queueAction(symbol: string, action: string): Promise<string> {
  try {
    const res = await axios.post('http://localhost:' + (process.env.PORT || '3001') + '/api/actions', {
      action, symbol
    });
    return res.data?.message || 'Action queued.';
  } catch (err: any) {
    return `Failed to queue action: ${err.message}`;
  }
}

// ── Update handlers ─────────────────────────────────────────────────────────

async function handleCommand(chatId: string | number, command: string) {
  switch (command) {
    case '/start':
    case '/menu':
      await sendMessage(chatId, 'Sentinel Finance - Command Center\n\nChoose an option:', MAIN_MENU);
      break;

    case '/positions': {
      await sendMessage(chatId, 'Fetching positions...');
      const { text, keyboard } = await buildPositionsMessage();
      await sendMessage(chatId, text, keyboard);
      break;
    }

    case '/risk': {
      await sendMessage(chatId, 'Calculating risk...');
      const text = await buildRiskMessage();
      await sendMessage(chatId, text, backMenu());
      break;
    }

    case '/signals': {
      await sendMessage(chatId, 'Loading signals...');
      const text = await buildSignalsMessage();
      await sendMessage(chatId, text, backMenu());
      break;
    }

    case '/macro': {
      const text = await buildMacroMessage();
      await sendMessage(chatId, text, backMenu());
      break;
    }

    case '/alerts':
      await sendMessage(chatId,
        'Alerts are sent automatically when risk exceeds threshold.\n\nCheck Supabase dashboard for full alert history.',
        backMenu());
      break;

    case '/buy':
      await sendMessage(chatId, buildBuyMessage(), backMenu());
      break;

    case '/sell':
      await sendMessage(chatId, buildSellMessage(), backMenu());
      break;

    case '/status': {
      const text = await buildStatusMessage();
      await sendMessage(chatId, text, backMenu());
      break;
    }

    case '/help':
      await sendMessage(chatId, buildHelpMessage(), backMenu());
      break;

    default:
      await sendMessage(chatId, 'Unknown command. Use /help to see available commands.', backMenu());
  }
}

async function handleCallbackQuery(queryId: string, chatId: string | number, msgId: number, data: string) {
  await answerCallback(queryId);

  if (data === 'cmd_menu') {
    await editMessage(chatId, msgId, 'Sentinel Finance - Command Center\n\nChoose an option:', MAIN_MENU);
    return;
  }

  if (data.startsWith('cmd_')) {
    const cmd = '/' + data.replace('cmd_', '');
    await handleCommand(chatId, cmd);
    return;
  }

  if (data.startsWith('action_close_')) {
    const symbol = data.replace('action_close_', '').replace(/_/g, '-');
    const result = await queueAction(symbol, 'CLOSE_POSITION');
    await sendMessage(chatId, `Close queued for ${symbol}\n\n${result}`, backMenu());
    return;
  }

  if (data.startsWith('action_reduce_')) {
    const symbol = data.replace('action_reduce_', '').replace(/_/g, '-');
    const result = await queueAction(symbol, 'REDUCE_LEVERAGE');
    await sendMessage(chatId, `Reduce leverage queued for ${symbol}\n\n${result}`, backMenu());
    return;
  }
}

async function handleUpdate(update: any) {
  const authorizedId = authorizedChatId();

  // Text messages / commands
  if (update.message) {
    const msg = update.message;
    const chatId = String(msg.chat?.id);
    const text: string = msg.text || '';

    if (authorizedId && chatId !== authorizedId) return; // ignore unauthorized chats

    if (text.startsWith('/')) {
      const command = text.split(' ')[0].toLowerCase().split('@')[0]; // strip bot name suffix
      await handleCommand(chatId, command);
    }
  }

  // Inline button presses
  if (update.callback_query) {
    const q = update.callback_query;
    const chatId = String(q.message?.chat?.id);

    if (authorizedId && chatId !== authorizedId) return;

    await handleCallbackQuery(q.id, chatId, q.message?.message_id, q.data || '');
  }
}

// ── Polling loop ────────────────────────────────────────────────────────────

async function poll() {
  const base = apiBase();
  if (!base) return;

  try {
    const res = await axios.get(`${base}/getUpdates`, {
      params: { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] },
      timeout: 30000
    });

    const updates: any[] = res.data?.result || [];

    for (const update of updates) {
      offset = update.update_id + 1;
      handleUpdate(update).catch((err: any) =>
        console.error(`[TelegramBot] Update error: ${err.message}`)
      );
    }
  } catch (err: any) {
    if (!err.message?.includes('timeout')) {
      console.error(`[TelegramBot] Poll error: ${err.message}`);
    }
  }

  if (polling) setTimeout(poll, 100);
}

function startBot() {
  if (!apiBase()) {
    console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN not set — bot disabled.');
    return;
  }

  polling = true;
  console.log('[TelegramBot] Polling started. Send /menu to your bot.');
  poll();
}

function stopBot() {
  polling = false;
}

export = { startBot, stopBot };
