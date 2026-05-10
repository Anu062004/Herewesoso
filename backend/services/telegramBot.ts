import axios from 'axios';
import sodex = require('./sodex');
import sosovalue = require('./sosovalue');
import riskCalculator = require('../utils/riskCalculator');

type InlineButton = { text: string; callback_data: string };
type InlineKeyboard = { inline_keyboard: InlineButton[][] };

const WALLET = process.env.USER_WALLET_ADDRESS || '';
const ALERT_THRESHOLD = parseInt(process.env.RISK_ALERT_THRESHOLD || '65', 10);
const HIGH_IMPACT = ['CPI', 'FOMC', 'Federal Reserve', 'GDP', 'NFP', 'Jobs', 'PCE'];
const PORT = process.env.PORT || '3001';

let offset = 0;
let polling = false;

// ── Emojis ──────────────────────────────────────────────────────────────────

const SIGNAL_EMOJI: Record<string, string> = {
  STRONG_BUY: '🚀', BUY: '📈', WATCH: '👀', NEUTRAL: '➖', AVOID: '🚫'
};

const RISK_EMOJI: Record<string, string> = {
  SAFE: '🟢', CAUTION: '🟡', DANGER: '🟠', CRITICAL: '🔴'
};

function riskEmoji(level: string): string {
  return RISK_EMOJI[level] || '⚪';
}

function signalEmoji(signal: string): string {
  return SIGNAL_EMOJI[signal] || '➖';
}

function pnlEmoji(pnl: number): string {
  return pnl >= 0 ? '🟢' : '🔴';
}

const DIV = '─────────────────────';

// ── Low-level API helpers ────────────────────────────────────────────────────

function apiBase(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? `https://api.telegram.org/bot${token}` : null;
}

function authorizedChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

async function sendMessage(
  chatId: string | number,
  text: string,
  keyboard: InlineKeyboard | null = null
): Promise<number | null> {
  const base = apiBase();
  if (!base) return null;
  const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
  if (keyboard) body.reply_markup = keyboard;
  try {
    const res = await axios.post(`${base}/sendMessage`, body);
    return res.data?.result?.message_id ?? null;
  } catch (err: any) {
    console.error(`[TelegramBot] sendMessage failed: ${err.message}`);
    return null;
  }
}

async function editMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  keyboard: InlineKeyboard | null = null
) {
  const base = apiBase();
  if (!base) return;
  const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true };
  if (keyboard) body.reply_markup = keyboard;
  try {
    await axios.post(`${base}/editMessageText`, body);
  } catch (err: any) {
    if (!err.message?.includes('not modified')) {
      console.error(`[TelegramBot] editMessage failed: ${err.message}`);
    }
  }
}

async function answerCallback(id: string, text = '') {
  const base = apiBase();
  if (!base) return;
  try {
    await axios.post(`${base}/answerCallbackQuery`, { callback_query_id: id, text });
  } catch { /* silent */ }
}

// ── Keyboards ────────────────────────────────────────────────────────────────

const MAIN_MENU: InlineKeyboard = {
  inline_keyboard: [
    [{ text: '📊 Positions', callback_data: 'cmd_positions' }, { text: '⚠️ Risk Check', callback_data: 'cmd_risk' }],
    [{ text: '📡 Signals', callback_data: 'cmd_signals' }, { text: '📅 Macro Events', callback_data: 'cmd_macro' }],
    [{ text: '🟢 Buy', callback_data: 'cmd_buy' }, { text: '🔴 Sell / Close', callback_data: 'cmd_sell' }],
    [{ text: '🚨 Panic Mode', callback_data: 'cmd_panic' }, { text: '⚙️ Status', callback_data: 'cmd_status' }],
    [{ text: '🔄 Refresh Menu', callback_data: 'cmd_menu' }, { text: '❓ Help', callback_data: 'cmd_help' }]
  ]
};

function navBar(refreshCmd: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: '🔄 Refresh', callback_data: refreshCmd }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]
    ]
  };
}

function positionListKeyboard(symbols: string[]): InlineKeyboard {
  const symbolButtons = symbols.map(s => ({
    text: `📋 ${s}`,
    callback_data: `pos_detail_${s.replace(/[^A-Za-z0-9]/g, '_')}`
  }));
  const rows: InlineButton[][] = [];
  for (let i = 0; i < symbolButtons.length; i += 2) {
    rows.push(symbolButtons.slice(i, i + 2));
  }
  rows.push([{ text: '🔄 Refresh', callback_data: 'cmd_positions' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]);
  return { inline_keyboard: rows };
}

function positionDetailKeyboard(symbol: string): InlineKeyboard {
  const safe = symbol.replace(/[^A-Za-z0-9]/g, '_');
  return {
    inline_keyboard: [
      [{ text: '🔴 Close Position', callback_data: `action_close_${safe}` }],
      [{ text: '📉 Reduce Leverage', callback_data: `action_reduce_${safe}` }, { text: '💰 Add Margin', callback_data: `action_margin_${safe}` }],
      [{ text: '🔄 Refresh', callback_data: `pos_detail_${safe}` }, { text: '◀️ All Positions', callback_data: 'cmd_positions' }],
      [{ text: '🏠 Menu', callback_data: 'cmd_menu' }]
    ]
  };
}

function riskKeyboard(symbols: string[]): InlineKeyboard {
  const rows: InlineButton[][] = symbols.map(s => [
    { text: `⚠️ Act on ${s}`, callback_data: `pos_detail_${s.replace(/[^A-Za-z0-9]/g, '_')}` }
  ]);
  rows.push([{ text: '🔄 Refresh', callback_data: 'cmd_risk' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]);
  return { inline_keyboard: rows };
}

function panicKeyboard(symbols: string[]): InlineKeyboard {
  const rows: InlineButton[][] = symbols.map(s => [
    { text: `🔴 CLOSE ${s}`, callback_data: `action_close_${s.replace(/[^A-Za-z0-9]/g, '_')}` }
  ]);
  rows.push([{ text: '🔄 Refresh', callback_data: 'cmd_panic' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]);
  return { inline_keyboard: rows };
}

// ── Formatters ───────────────────────────────────────────────────────────────

function fmt(n: number, d = 2): string { return n.toFixed(d); }

function fmtNum(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}

function riskBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function timeAgo(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function getPositionData() {
  const { positions, accountState } = await sodex.getEnrichedPositions(WALLET);
  const macroRaw = await sosovalue.getMacroEvents().catch(() => ({ data: [] }));
  const macro = (macroRaw?.data || []) as any[];
  const dangerous = macro.filter(e => HIGH_IMPACT.some(k => String(e?.name || '').includes(k)));

  const enriched = (positions || []).map((pos: any) => {
    const mark = parseFloat(String(pos.markPrice || pos.entryPrice || 0));
    const liq = parseFloat(String(pos.liquidationPrice || 0));
    const entry = parseFloat(String(pos.entryPrice || 0));
    const leverage = parseFloat(String(pos.leverage || 0));
    const size = parseFloat(String(pos.positionSize || 0));
    const side = pos.positionSide || pos.side || 'LONG';
    const distPct = riskCalculator.calculateLiquidationDistance(mark, liq, side);
    const posRisk = riskCalculator.distanceToRiskScore(distPct);
    const pnl = side === 'SHORT' ? (entry - mark) * size : (mark - entry) * size;

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
    const riskLevel = riskCalculator.scoreToRiskLevel(combined);
    const action = riskCalculator.suggestAction(riskLevel, leverage, distPct);

    return { ...pos, mark, liq, entry, leverage, size, side, distPct, posRisk, combined, riskLevel, action, pnl, nearestEvent, nearestHours };
  });

  return { enriched, accountState: accountState as any };
}

// ── Message builders ──────────────────────────────────────────────────────────

async function buildMenuText(): Promise<string> {
  let accountLine = '';
  if (WALLET) {
    try {
      const { accountState } = await sodex.getEnrichedPositions(WALLET);
      const acc = accountState as any;
      if (acc) {
        accountLine = `\n💼 Account: $${fmtNum(acc.accountValue || 0)}  |  Margin: $${fmtNum(acc.availableMargin || 0)}`;
      }
    } catch { /* skip */ }
  }
  return `🛡️ SENTINEL FINANCE${accountLine}\n${DIV}\nSelect an option below:`;
}

async function buildPositionsOverview(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_positions') };

  try {
    const { enriched, accountState: acc } = await getPositionData();

    if (!enriched.length) {
      return { text: '📭 No open positions found.\n\nMarket is flat — nothing to monitor.', keyboard: navBar('cmd_positions') };
    }

    const lines = [
      '📊 OPEN POSITIONS',
      DIV,
      `💼 Account Value : $${fmtNum(acc?.accountValue || 0)}`,
      `🏦 Avail. Margin : $${fmtNum(acc?.availableMargin || 0)}`,
      `📋 Positions Open: ${enriched.length}`,
      DIV,
    ];

    for (const p of enriched) {
      const sideIcon = p.side === 'SHORT' ? '📉' : '📈';
      lines.push(`${sideIcon} ${p.symbol}  ${p.leverage}x  ${riskEmoji(p.riskLevel)} ${p.riskLevel}`);
      lines.push(`   PnL: ${pnlEmoji(p.pnl)} ${p.pnl >= 0 ? '+' : ''}$${fmt(p.pnl)}  |  Liq: ${fmt(p.distPct)}% away`);
    }

    lines.push(DIV);
    lines.push('Tap a position for full details & actions:');
    lines.push(`Updated: ${timeAgo()}`);

    return {
      text: lines.join('\n'),
      keyboard: positionListKeyboard(enriched.map((p: any) => p.symbol))
    };
  } catch (err: any) {
    return { text: `❌ Failed to fetch positions: ${err.message}`, keyboard: navBar('cmd_positions') };
  }
}

async function buildPositionDetail(symbolRaw: string): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_positions') };

  try {
    const { enriched } = await getPositionData();
    const p = enriched.find((x: any) => x.symbol === symbolRaw);

    if (!p) return { text: `❌ Position ${symbolRaw} not found.`, keyboard: navBar('cmd_positions') };

    const sideIcon = p.side === 'SHORT' ? '📉 SHORT' : '📈 LONG';
    const lines = [
      `📋 ${p.symbol} — DETAILS`,
      DIV,
      `Direction  : ${sideIcon}`,
      `Leverage   : ${p.leverage}x`,
      `Size       : ${p.size}`,
      DIV,
      `Entry Price: $${fmtNum(p.entry)}`,
      `Mark Price : $${fmtNum(p.mark)}`,
      `Liq Price  : $${fmtNum(p.liq)}`,
      DIV,
      `PnL        : ${pnlEmoji(p.pnl)} ${p.pnl >= 0 ? '+' : ''}$${fmt(p.pnl)}`,
      `Liq Dist   : ${fmt(p.distPct)}% away`,
      DIV,
      `Risk Score : ${riskEmoji(p.riskLevel)} ${p.riskLevel} (${p.combined}/100)`,
      `Risk Bar   : ${riskBar(p.combined)}`,
      p.nearestEvent ? `Macro Threat: ${p.nearestEvent} in ${fmt(p.nearestHours, 1)}h` : `Macro Threat: None imminent`,
      DIV,
      `Suggestion : ${p.action}`,
      p.combined >= ALERT_THRESHOLD ? '\n🚨 HIGH RISK — IMMEDIATE ACTION NEEDED' : '',
      `Updated: ${timeAgo()}`
    ].filter(Boolean);

    return { text: lines.join('\n'), keyboard: positionDetailKeyboard(p.symbol) };
  } catch (err: any) {
    return { text: `❌ Error: ${err.message}`, keyboard: navBar('cmd_positions') };
  }
}

async function buildRiskOverview(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_risk') };

  try {
    const { enriched } = await getPositionData();

    if (!enriched.length) return { text: '✅ No open positions — nothing at risk.', keyboard: navBar('cmd_risk') };

    const lines = ['⚠️ RISK OVERVIEW', DIV];

    let maxRisk = 0;
    for (const p of enriched) {
      if (p.combined > maxRisk) maxRisk = p.combined;
      lines.push(`${riskEmoji(p.riskLevel)} ${p.symbol}`);
      lines.push(`   Score  : ${p.combined}/100  ${riskBar(p.combined)}`);
      lines.push(`   Liq in : ${fmt(p.distPct)}%   Leverage: ${p.leverage}x`);
      if (p.nearestEvent) lines.push(`   Macro  : ${p.nearestEvent} in ${fmt(p.nearestHours, 1)}h`);
      lines.push(`   Action : ${p.action}`);
      if (p.combined >= ALERT_THRESHOLD) lines.push('   🚨 ALERT THRESHOLD EXCEEDED');
      lines.push('');
    }

    lines.push(DIV);
    if (maxRisk >= ALERT_THRESHOLD) {
      lines.push('🚨 One or more positions need immediate attention!');
    } else {
      lines.push('✅ All positions within acceptable risk range.');
    }
    lines.push(`Updated: ${timeAgo()}`);

    return {
      text: lines.join('\n'),
      keyboard: riskKeyboard(enriched.map((p: any) => p.symbol))
    };
  } catch (err: any) {
    return { text: `❌ Failed to assess risk: ${err.message}`, keyboard: navBar('cmd_risk') };
  }
}

async function buildSignalsOverview(): Promise<string> {
  try {
    const narrativeScorer = require('../utils/narrativeScorer');
    const SECTORS = ['DeFi', 'AI', 'RWA', 'L1', 'L2', 'GameFi', 'DePIN', 'Meme'];
    const [newsRaw, etfRaw, macroRaw] = await Promise.all([
      sosovalue.getNews(50).catch(() => ({ data: [] })),
      sosovalue.getETFSummaryHistory(7).catch(() => ({ data: {} })),
      sosovalue.getMacroEvents().catch(() => ({ data: [] }))
    ]);

    const headlines = (newsRaw?.data || []) as any[];
    const etf = (etfRaw?.data as any)?.netFlow7Day ?? 0;
    const upcoming = (macroRaw?.data || []) as any[];

    const scores = SECTORS.map(sector => {
      const n = narrativeScorer.scoreNarrativeLayer(headlines, sector);
      const e = narrativeScorer.scoreETFLayer(etf);
      const m = narrativeScorer.scoreMacroLayer(upcoming);
      const { combined, signal } = narrativeScorer.generateSignal(n, e, m);
      return { sector, combined, signal };
    }).sort((a: any, b: any) => b.combined - a.combined);

    const lines = ['📡 NARRATIVE SIGNALS', DIV];

    for (const s of scores) {
      const emoji = signalEmoji(s.signal);
      const bar = riskBar(s.combined);
      lines.push(`${emoji} ${s.sector.padEnd(8)} ${s.signal.padEnd(12)} ${s.combined}/100`);
      lines.push(`   ${bar}`);
    }

    lines.push(DIV);
    lines.push(`ETF 7d Flow: ${etf >= 0 ? '🟢' : '🔴'} $${fmtNum(Math.abs(etf))} ${etf >= 0 ? 'inflow' : 'outflow'}`);
    lines.push(`Macro Events: ${upcoming.length} upcoming`);
    lines.push(`Updated: ${timeAgo()}`);

    return lines.join('\n');
  } catch (err: any) {
    return `❌ Failed to load signals: ${err.message}`;
  }
}

async function buildMacroOverview(): Promise<string> {
  try {
    const raw = await sosovalue.getMacroEvents();
    const events = (raw?.data || []) as any[];

    if (!events.length) return '📅 No macro events in the next 48 hours.\n\n✅ Clear macro window — good time to trade.';

    const lines = ['📅 MACRO CALENDAR', DIV];

    for (const ev of events.slice(0, 12)) {
      const ts = ev.eventTime || ev.releaseDate || ev.date || '';
      const hoursAway = ts ? ((new Date(ts).getTime() - Date.now()) / 3600000) : null;
      const hoursStr = hoursAway !== null ? `${fmt(hoursAway, 1)}h` : '?';
      const isHigh = HIGH_IMPACT.some(k => String(ev.name || '').includes(k));
      const icon = isHigh ? '🚨' : '📌';
      const urgency = hoursAway !== null && hoursAway < 6 ? ' ⚡ SOON' : '';
      lines.push(`${icon} ${ev.name || 'Unknown'}`);
      lines.push(`   In ${hoursStr}${urgency}`);
    }

    const highCount = events.filter(e => HIGH_IMPACT.some(k => String(e?.name || '').includes(k))).length;
    lines.push(DIV);
    lines.push(`🚨 High Impact: ${highCount}  |  📌 Total: ${events.length}`);
    lines.push(`Updated: ${timeAgo()}`);

    return lines.join('\n');
  } catch (err: any) {
    return `❌ Failed to load macro events: ${err.message}`;
  }
}

async function buildPanicMode(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_panic') };

  try {
    const { enriched, accountState: acc } = await getPositionData();

    if (!enriched.length) {
      return { text: '✅ No open positions to close.\n\nYou are flat.', keyboard: navBar('cmd_panic') };
    }

    const lines = [
      '🚨 PANIC MODE',
      DIV,
      'One-tap close for each position:',
      '',
    ];

    for (const p of enriched) {
      lines.push(`${riskEmoji(p.riskLevel)} ${p.symbol}  ${p.leverage}x  ${p.side}`);
      lines.push(`   PnL: ${p.pnl >= 0 ? '+' : ''}$${fmt(p.pnl)}  |  Risk: ${p.riskLevel}`);
    }

    lines.push(DIV);
    lines.push('⚠️ Positions will be queued for closure immediately.');
    lines.push('Execution via EIP-712 (Wave 2).');

    return {
      text: lines.join('\n'),
      keyboard: panicKeyboard(enriched.map((p: any) => p.symbol))
    };
  } catch (err: any) {
    return { text: `❌ Error: ${err.message}`, keyboard: navBar('cmd_panic') };
  }
}

async function buildStatusOverview(): Promise<string> {
  const aiService = (process.env.AI_SERVICE || 'groq').toUpperCase();
  const aiModel = process.env.GROQ_MODEL || process.env.GEMINI_MODEL || process.env.ANTHROPIC_MODEL || 'default';
  const cycleMin = Math.round(parseInt(process.env.CYCLE_INTERVAL_MS || '1800000') / 60000);
  const supaOk = process.env.SUPABASE_URL?.startsWith('http');

  return [
    '⚙️ SYSTEM STATUS',
    DIV,
    `🖥️  Server     : Running`,
    `🤖 AI Service : ${aiService} (${aiModel})`,
    `⏱️  Scheduler  : Every ${cycleMin} minutes`,
    `💼 Wallet     : ${WALLET ? WALLET.slice(0, 8) + '...' + WALLET.slice(-4) : '❌ Not set'}`,
    `🗄️  Supabase   : ${supaOk ? '✅ Connected' : '⚠️ Not configured'}`,
    `📨 Telegram   : ✅ Active`,
    `⚡ Auto Trade : ${process.env.AUTO_EXECUTE === 'true' ? '✅ ENABLED' : '❌ Disabled'}`,
    DIV,
    `🕐 Time (UTC) : ${new Date().toUTCString()}`,
  ].join('\n');
}

function buildHelpText(): string {
  return [
    '❓ HELP — SENTINEL FINANCE BOT',
    DIV,
    '📊 /positions  — Live positions + P&L',
    '⚠️  /risk       — Risk score per position',
    '📡 /signals    — All 8 sector signals',
    '📅 /macro      — Macro event calendar',
    '🟢 /buy        — Queue a buy order',
    '🔴 /sell       — Queue a sell/close',
    '🚨 /panic      — Emergency close all',
    '⚙️  /status     — System health',
    '🏠 /menu       — Main menu',
    '❓ /help       — This message',
    DIV,
    'Auto alerts fire every 30 min when:',
    '• Risk score exceeds threshold',
    '• High-impact macro event < 6h away',
    '• Strong BUY/SELL signal detected',
  ].join('\n');
}

function buildBuyText(): string {
  return [
    '🟢 BUY ORDER',
    DIV,
    'Send a message in this format:',
    '',
    'BUY [SYMBOL] [SIZE] [LEVERAGE]x',
    '',
    'Examples:',
    '  BUY BTC-USD 0.01 10x',
    '  BUY ETH-USD 0.1 5x',
    '',
    DIV,
    '⚠️ Orders are queued for execution.',
    'EIP-712 signing coming in Wave 2.',
    'Use /positions to confirm after.',
  ].join('\n');
}

function buildSellText(): string {
  return [
    '🔴 SELL / CLOSE ORDER',
    DIV,
    'Send a message in this format:',
    '',
    'SELL [SYMBOL] [SIZE]',
    '',
    'Examples:',
    '  SELL BTC-USD 0.01',
    '  SELL ETH-USD ALL',
    '',
    DIV,
    'To close a full position instantly,',
    'use the 🔴 Close button on /positions.',
    '',
    '⚠️ Orders are queued for execution.',
    'EIP-712 signing coming in Wave 2.',
  ].join('\n');
}

// ── Action queuer ─────────────────────────────────────────────────────────────

async function queueAction(symbol: string, action: string, extra: Record<string, unknown> = {}): Promise<string> {
  try {
    const res = await axios.post(`http://localhost:${PORT}/api/actions`, { action, symbol, ...extra });
    return res.data?.message || 'Action queued successfully.';
  } catch (err: any) {
    return `Failed to queue: ${err.message}`;
  }
}

// ── Command & callback handlers ───────────────────────────────────────────────

async function handleCommand(chatId: string | number, command: string) {
  switch (command) {
    case '/start':
    case '/menu': {
      const text = await buildMenuText().catch(() => '🛡️ SENTINEL FINANCE\n\nSelect an option:');
      await sendMessage(chatId, text, MAIN_MENU);
      break;
    }
    case '/positions': {
      const loading = await sendMessage(chatId, '⏳ Fetching positions...');
      const { text, keyboard } = await buildPositionsOverview();
      await sendMessage(chatId, text, keyboard);
      break;
    }
    case '/risk': {
      await sendMessage(chatId, '⏳ Calculating risk...');
      const { text, keyboard } = await buildRiskOverview();
      await sendMessage(chatId, text, keyboard);
      break;
    }
    case '/signals': {
      await sendMessage(chatId, '⏳ Loading signals...');
      const text = await buildSignalsOverview();
      await sendMessage(chatId, text, navBar('cmd_signals'));
      break;
    }
    case '/macro': {
      await sendMessage(chatId, '⏳ Loading macro calendar...');
      const text = await buildMacroOverview();
      await sendMessage(chatId, text, navBar('cmd_macro'));
      break;
    }
    case '/panic': {
      await sendMessage(chatId, '⏳ Loading positions...');
      const { text, keyboard } = await buildPanicMode();
      await sendMessage(chatId, text, keyboard);
      break;
    }
    case '/buy':
      await sendMessage(chatId, buildBuyText(), navBar('cmd_menu'));
      break;
    case '/sell':
      await sendMessage(chatId, buildSellText(), navBar('cmd_menu'));
      break;
    case '/status': {
      const text = await buildStatusOverview();
      await sendMessage(chatId, text, navBar('cmd_status'));
      break;
    }
    case '/help':
      await sendMessage(chatId, buildHelpText(), navBar('cmd_menu'));
      break;
    default:
      await sendMessage(chatId, '❓ Unknown command.\n\nSend /menu to see all options.', navBar('cmd_menu'));
  }
}

async function handleCallbackQuery(queryId: string, chatId: string | number, msgId: number, data: string) {
  await answerCallback(queryId, '⏳ Loading...');

  // Menu
  if (data === 'cmd_menu') {
    const text = await buildMenuText().catch(() => '🛡️ SENTINEL FINANCE\n\nSelect an option:');
    await editMessage(chatId, msgId, text, MAIN_MENU);
    return;
  }

  // Position detail
  if (data.startsWith('pos_detail_')) {
    const symbol = data.replace('pos_detail_', '').replace(/_/g, '-');
    const { text, keyboard } = await buildPositionDetail(symbol);
    await sendMessage(chatId, text, keyboard);
    return;
  }

  // Actions
  if (data.startsWith('action_close_')) {
    const symbol = data.replace('action_close_', '').replace(/_/g, '-');
    await answerCallback(queryId, '🔴 Closing...');
    const result = await queueAction(symbol, 'CLOSE_POSITION');
    await sendMessage(chatId,
      `🔴 CLOSE QUEUED — ${symbol}\n${DIV}\n${result}\n\nUse /positions to verify.`,
      navBar('cmd_positions')
    );
    return;
  }

  if (data.startsWith('action_reduce_')) {
    const symbol = data.replace('action_reduce_', '').replace(/_/g, '-');
    await answerCallback(queryId, '📉 Queuing...');
    const result = await queueAction(symbol, 'REDUCE_LEVERAGE');
    await sendMessage(chatId,
      `📉 REDUCE LEVERAGE QUEUED — ${symbol}\n${DIV}\n${result}\n\nUse /risk to monitor.`,
      navBar('cmd_risk')
    );
    return;
  }

  if (data.startsWith('action_margin_')) {
    const symbol = data.replace('action_margin_', '').replace(/_/g, '-');
    await sendMessage(chatId,
      `💰 ADD MARGIN — ${symbol}\n${DIV}\nTo add margin, transfer funds to your cross-margin account on SoDEX.\n\nThis increases your buffer and reduces liquidation risk.\n\nUse /risk to re-check after deposit.`,
      navBar('cmd_risk')
    );
    return;
  }

  // Generic cmd_ → route to command handler
  if (data.startsWith('cmd_')) {
    const cmd = '/' + data.replace('cmd_', '');
    await handleCommand(chatId, cmd);
    return;
  }
}

// ── Update dispatcher ─────────────────────────────────────────────────────────

async function handleUpdate(update: any) {
  const authorizedId = authorizedChatId();

  if (update.message) {
    const msg = update.message;
    const chatId = String(msg.chat?.id);
    const text: string = msg.text || '';
    if (authorizedId && chatId !== authorizedId) return;

    if (text.startsWith('/')) {
      const command = text.split(' ')[0].toLowerCase().split('@')[0];
      await handleCommand(chatId, command);
    }
  }

  if (update.callback_query) {
    const q = update.callback_query;
    const chatId = String(q.message?.chat?.id);
    if (authorizedId && chatId !== authorizedId) return;
    await handleCallbackQuery(q.id, chatId, q.message?.message_id, q.data || '');
  }
}

// ── Polling loop ──────────────────────────────────────────────────────────────

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

function stopBot() { polling = false; }

export = { startBot, stopBot };
