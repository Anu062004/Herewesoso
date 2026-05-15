import axios from 'axios';
import sodex = require('./sodex');
import sosovalue = require('./sosovalue');
import sodexTrader = require('./sodexTrader');
import riskCalculator = require('../utils/riskCalculator');

type InlineButton = { text: string; callback_data: string };
type InlineKeyboard = { inline_keyboard: InlineButton[][] };

const WALLET = process.env.USER_WALLET_ADDRESS || '';
const ALERT_THRESHOLD = parseInt(process.env.RISK_ALERT_THRESHOLD || '65', 10);
const HIGH_IMPACT = ['CPI', 'FOMC', 'Federal Reserve', 'GDP', 'NFP', 'Jobs', 'PCE'];
const PORT = process.env.PORT || '3001';

let offset = 0;
let polling = false;

// ── Conversation state machine ────────────────────────────────────────────────

type ConvStep =
  | { type: 'idle' }
  | { type: 'setkey' }
  | { type: 'buy_symbol' }
  | { type: 'buy_side'; symbol: string }
  | { type: 'buy_size'; symbol: string; side: 'BUY' | 'SELL' }
  | { type: 'buy_leverage'; symbol: string; side: 'BUY' | 'SELL'; size: string }
  | { type: 'buy_confirm'; symbol: string; side: 'BUY' | 'SELL'; size: string; leverage: number }
  | { type: 'close_select' }
  | { type: 'close_confirm'; symbol: string; size: string }
  | { type: 'reduce_select' }
  | { type: 'reduce_leverage'; symbol: string; currentLeverage: number }
  | { type: 'reduce_confirm'; symbol: string; newLeverage: number };

const conv: Map<string, ConvStep> = new Map();
function getStep(chatId: string): ConvStep { return conv.get(chatId) || { type: 'idle' }; }
function setStep(chatId: string, step: ConvStep) { conv.set(chatId, step); }
function resetStep(chatId: string) { conv.set(chatId, { type: 'idle' }); }

// ── Emojis ────────────────────────────────────────────────────────────────────

const SIGNAL_EMOJI: Record<string, string> = {
  STRONG_BUY: '🚀', BUY: '📈', WATCH: '👀', NEUTRAL: '➖', AVOID: '🚫'
};
const RISK_EMOJI: Record<string, string> = {
  SAFE: '🟢', CAUTION: '🟡', DANGER: '🟠', CRITICAL: '🔴'
};
function riskEmoji(level: string) { return RISK_EMOJI[level] || '⚪'; }
function signalEmoji(signal: string) { return SIGNAL_EMOJI[signal] || '➖'; }
function pnlEmoji(pnl: number) { return pnl >= 0 ? '🟢' : '🔴'; }
const DIV = '─────────────────────';

// ── Low-level API helpers ─────────────────────────────────────────────────────

function apiBase(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? `https://api.telegram.org/bot${token}` : null;
}
function authorizedChatId() { return process.env.TELEGRAM_CHAT_ID; }

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function deduplicateNews(items: any[]): any[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const raw = (item.title || item.content || '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const key = raw.slice(0, 65);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isHighImpactNews(text: string): boolean {
  const lower = text.toLowerCase();
  return HIGH_IMPACT.some(k => lower.includes(k.toLowerCase())) ||
    ['fed', 'sec', 'etf', 'hack', 'crash', 'ban', 'sanction', 'bankruptcy', 'liquidation', 'exploit'].some(k => lower.includes(k));
}

async function sendMessage(
  chatId: string | number,
  text: string,
  keyboard?: InlineKeyboard | null,
  parseMode?: 'HTML'
): Promise<any> {
  const base = apiBase();
  if (!base) return null;
  const body: Record<string, unknown> = { chat_id: chatId, text, disable_web_page_preview: true };
  if (keyboard) body.reply_markup = keyboard;
  if (parseMode) body.parse_mode = parseMode;
  try {
    const r = await axios.post(`${base}/sendMessage`, body);
    return r.data?.result;
  } catch { return null; }
}

async function editMessage(chatId: string | number, msgId: number, text: string, keyboard?: InlineKeyboard | null) {
  const base = apiBase();
  if (!base) return;
  const body: Record<string, unknown> = { chat_id: chatId, message_id: msgId, text, disable_web_page_preview: true };
  if (keyboard) body.reply_markup = keyboard;
  try { await axios.post(`${base}/editMessageText`, body); } catch {}
}

async function deleteMessage(chatId: string | number, msgId: number) {
  const base = apiBase();
  if (!base) return;
  try { await axios.post(`${base}/deleteMessage`, { chat_id: chatId, message_id: msgId }); } catch {}
}

async function answerCallback(queryId: string, text?: string) {
  const base = apiBase();
  if (!base) return;
  try { await axios.post(`${base}/answerCallbackQuery`, { callback_query_id: queryId, text }); } catch {}
}

// ── Keyboard builders ─────────────────────────────────────────────────────────

const MAIN_MENU: InlineKeyboard = {
  inline_keyboard: [
    [{ text: '📊 Positions',    callback_data: 'cmd_positions' }, { text: '⚠️ Risk Check',  callback_data: 'cmd_risk' }],
    [{ text: '🟢 Buy / Long',   callback_data: 'cmd_buy' },       { text: '🔴 Sell / Short', callback_data: 'cmd_short' }],
    [{ text: '❌ Close Position',callback_data: 'cmd_close' },    { text: '📉 Reduce Lev',  callback_data: 'cmd_reduce' }],
    [{ text: '📡 Signals',      callback_data: 'cmd_signals' },   { text: '📅 Macro',       callback_data: 'cmd_macro' }],
    [{ text: '🗞 News',          callback_data: 'cmd_news' },     { text: '🤖 AI Brief',    callback_data: 'cmd_summary' }],
    [{ text: '🚨 Panic Close All',callback_data: 'cmd_panic' },   { text: '🔑 Wallet Key',  callback_data: 'cmd_keyinfo' }],
    [{ text: '⚙️ Status',       callback_data: 'cmd_status' },    { text: '❓ Help',        callback_data: 'cmd_help' }],
  ]
};

function navBar(refreshCmd: string): InlineKeyboard {
  return { inline_keyboard: [[{ text: '🔄 Refresh', callback_data: refreshCmd }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]] };
}

function cancelBar(): InlineKeyboard {
  return { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cmd_cancel' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]] };
}

function confirmBar(confirmData: string): InlineKeyboard {
  return { inline_keyboard: [[{ text: '✅ Confirm', callback_data: confirmData }, { text: '❌ Cancel', callback_data: 'cmd_cancel' }]] };
}

function positionListKeyboard(symbols: string[]): InlineKeyboard {
  const rows = symbols.map(s => [{ text: `📍 ${s}`, callback_data: `pos_detail_${s.replace(/[^A-Za-z0-9]/g, '_')}` }]);
  rows.push([{ text: '🔄 Refresh', callback_data: 'cmd_positions' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]);
  return { inline_keyboard: rows };
}

function positionDetailKeyboard(symbol: string): InlineKeyboard {
  const safe = symbol.replace(/[^A-Za-z0-9]/g, '_');
  return {
    inline_keyboard: [
      [{ text: '❌ Close Position', callback_data: `trade_close_${safe}` }],
      [{ text: '📉 Reduce Leverage', callback_data: `trade_reduce_${safe}` }, { text: '💰 Add Margin', callback_data: `action_margin_${safe}` }],
      [{ text: '🔄 Refresh', callback_data: `pos_detail_${safe}` }, { text: '◀️ All Positions', callback_data: 'cmd_positions' }],
      [{ text: '🏠 Menu', callback_data: 'cmd_menu' }],
    ]
  };
}

function leverageKeyboard(symbol: string, currentLev: number): InlineKeyboard {
  const safe = symbol.replace(/[^A-Za-z0-9]/g, '_');
  const options = [1, 2, 3, 5, 10].filter(l => l < currentLev);
  const rows = options.map(l => [{ text: `${l}x`, callback_data: `set_lev_${safe}_${l}` }]);
  rows.push([{ text: '❌ Cancel', callback_data: 'cmd_cancel' }]);
  return { inline_keyboard: rows };
}

function sideKeyboard(symbol: string): InlineKeyboard {
  const safe = symbol.replace(/[^A-Za-z0-9]/g, '_');
  return {
    inline_keyboard: [
      [{ text: '🟢 Long (BUY)', callback_data: `order_side_${safe}_BUY` }, { text: '🔴 Short (SELL)', callback_data: `order_side_${safe}_SELL` }],
      [{ text: '❌ Cancel', callback_data: 'cmd_cancel' }],
    ]
  };
}

function leverageSelectKeyboard(symbol: string, side: string): InlineKeyboard {
  const safe = symbol.replace(/[^A-Za-z0-9]/g, '_');
  return {
    inline_keyboard: [
      [{ text: '1x', callback_data: `order_lev_${safe}_${side}_1` }, { text: '2x', callback_data: `order_lev_${safe}_${side}_2` }, { text: '3x', callback_data: `order_lev_${safe}_${side}_3` }],
      [{ text: '5x', callback_data: `order_lev_${safe}_${side}_5` }, { text: '10x', callback_data: `order_lev_${safe}_${side}_10` }, { text: '20x', callback_data: `order_lev_${safe}_${side}_20` }],
      [{ text: '❌ Cancel', callback_data: 'cmd_cancel' }],
    ]
  };
}

function panicKeyboard(symbols: string[]): InlineKeyboard {
  const rows = symbols.map(s => [{ text: `🔴 CLOSE ${s}`, callback_data: `trade_close_${s.replace(/[^A-Za-z0-9]/g, '_')}` }]);
  rows.push([{ text: '🔄 Refresh', callback_data: 'cmd_panic' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]);
  return { inline_keyboard: rows };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string | number | undefined | null): string {
  if (!ts) return 'unknown';
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function riskBar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${score}/100`;
}

// ── Screen builders ───────────────────────────────────────────────────────────

async function buildMenuText(): Promise<string> {
  const hasWallet = !!WALLET;
  const keySet = sodexTrader.hasKey();
  const keyAddr = sodexTrader.getWalletAddress();
  let accountLine = 'Account: not configured';
  if (hasWallet) {
    try {
      const { accountState } = await sodex.getEnrichedPositions(WALLET);
      if (accountState) {
        accountLine = `Account: $${accountState.accountValue.toFixed(2)} | Margin: $${accountState.availableMargin.toFixed(2)}`;
      }
    } catch { accountLine = `Wallet: ${WALLET.slice(0, 8)}...`; }
  }
  const keyLine = keySet
    ? `🔑 Key: ${keyAddr?.slice(0, 8)}... (ready to trade)`
    : '🔑 Key: not set (use /setkey to enable trading)';
  return `🛡️ SENTINEL FINANCE\n${DIV}\n${accountLine}\n${keyLine}\n${DIV}\nTestnet Mode`;
}

async function buildPositionsOverview(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_positions') };
  try {
    const { positions, accountState } = await sodex.getEnrichedPositions(WALLET);
    if (!positions.length) return { text: '✅ No open positions.\n\nYou are flat.', keyboard: navBar('cmd_positions') };

    const lines = [
      `📊 OPEN POSITIONS (${positions.length})`,
      `Account: $${accountState?.accountValue?.toFixed(2) || '--'}`,
      DIV,
    ];
    for (const p of positions) {
      const pnl = parseFloat(String(p.realizedPnL || 0));
      const mark = parseFloat(String(p.markPrice || p.entryPrice || 0));
      const entry = parseFloat(String(p.entryPrice || 0));
      const pnlPct = entry > 0 ? ((mark - entry) / entry * 100 * (p.positionSide === 'SHORT' ? -1 : 1)) : 0;
      lines.push(`${pnlEmoji(pnlPct)} ${p.symbol} ${p.positionSide || 'BOTH'}`);
      lines.push(`  Lev: ${p.leverage}x | Size: ${p.positionSize}`);
      lines.push(`  Entry: $${entry.toFixed(2)} | Mark: $${mark.toFixed(2)}`);
      lines.push(`  PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`);
    }
    lines.push(DIV);
    lines.push('Tap a position for details and actions:');
    return { text: lines.join('\n'), keyboard: positionListKeyboard(positions.map(p => p.symbol)) };
  } catch (err: any) {
    return { text: `❌ Error: ${err.message}`, keyboard: navBar('cmd_positions') };
  }
}

async function buildPositionDetail(symbol: string): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_positions') };
  try {
    const { positions, accountState } = await sodex.getEnrichedPositions(WALLET);
    const p = positions.find(x => x.symbol === symbol);
    if (!p) return { text: `❌ Position not found: ${symbol}`, keyboard: navBar('cmd_positions') };

    const mark = parseFloat(String(p.markPrice || p.entryPrice || 0));
    const entry = parseFloat(String(p.entryPrice || 0));
    const liq = parseFloat(String(p.liquidationPrice || 0));
    const pnlPct = entry > 0 ? ((mark - entry) / entry * 100 * (p.positionSide === 'SHORT' ? -1 : 1)) : 0;
    const distPct = liq > 0 && mark > 0 ? Math.abs((mark - liq) / mark * 100) : 0;
    const riskScore = riskCalculator.distanceToRiskScore(distPct);
    const riskLvl = riskCalculator.scoreToRiskLevel(riskScore);

    const text = [
      `📍 ${symbol} — ${riskEmoji(riskLvl)} ${riskLvl}`,
      DIV,
      `Side: ${p.positionSide || 'BOTH'} | Leverage: ${p.leverage}x`,
      `Size: ${p.positionSize} | Mode: ${p.marginMode || 'CROSS'}`,
      DIV,
      `Entry:       $${entry.toFixed(4)}`,
      `Mark:        $${mark.toFixed(4)}`,
      `Liquidation: $${liq > 0 ? liq.toFixed(4) : '--'}`,
      `Distance:    ${distPct > 0 ? distPct.toFixed(2) + '%' : '--'}`,
      DIV,
      `PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
      `Risk: ${riskBar(riskScore)}`,
      DIV,
      `Account: $${accountState?.accountValue?.toFixed(2) || '--'}`,
      `Updated: ${timeAgo(new Date().toISOString())} UTC`,
    ].join('\n');

    return { text, keyboard: positionDetailKeyboard(symbol) };
  } catch (err: any) {
    return { text: `❌ Error: ${err.message}`, keyboard: navBar('cmd_positions') };
  }
}

async function buildRiskOverview(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_risk') };
  try {
    const { positions } = await sodex.getEnrichedPositions(WALLET);
    if (!positions.length) return { text: '✅ No open positions — no risk.', keyboard: navBar('cmd_risk') };

    const lines = ['⚠️ RISK OVERVIEW', DIV];
    const rows: InlineButton[][] = [];
    for (const p of positions) {
      const mark = parseFloat(String(p.markPrice || p.entryPrice || 0));
      const liq = parseFloat(String(p.liquidationPrice || 0));
      const distPct = liq > 0 && mark > 0 ? Math.abs((mark - liq) / mark * 100) : 100;
      const riskScore = riskCalculator.distanceToRiskScore(distPct);
      const riskLvl = riskCalculator.scoreToRiskLevel(riskScore);
      lines.push(`${riskEmoji(riskLvl)} ${p.symbol} @ ${p.leverage}x`);
      lines.push(`  ${riskBar(riskScore)}`);
      lines.push(`  Liq dist: ${distPct > 0 ? distPct.toFixed(2) + '%' : '--'}`);
      rows.push([{ text: `⚡ Act on ${p.symbol}`, callback_data: `pos_detail_${p.symbol.replace(/[^A-Za-z0-9]/g, '_')}` }]);
    }
    rows.push([{ text: '🔄 Refresh', callback_data: 'cmd_risk' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }]);
    return { text: lines.join('\n'), keyboard: { inline_keyboard: rows } };
  } catch (err: any) {
    return { text: `❌ Error: ${err.message}`, keyboard: navBar('cmd_risk') };
  }
}

async function buildPanicMode(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  if (!WALLET) return { text: '❌ Wallet not configured.', keyboard: navBar('cmd_panic') };
  try {
    const { positions, accountState } = await sodex.getEnrichedPositions(WALLET);
    if (!positions.length) return { text: '✅ No open positions to close.\n\nYou are flat.', keyboard: navBar('cmd_panic') };

    const keySet = sodexTrader.hasKey();
    const lines = [
      '🚨 PANIC MODE',
      DIV,
      `Account: $${accountState?.accountValue?.toFixed(2) || '--'}`,
      `Open positions: ${positions.length}`,
      DIV,
      keySet
        ? '🔑 Key set — tap to execute close orders:'
        : '⚠️ No key set — buttons will show instructions.',
      '',
      'One-tap close for each position:',
    ];
    return {
      text: lines.join('\n'),
      keyboard: panicKeyboard(positions.map(p => p.symbol))
    };
  } catch (err: any) {
    return { text: `❌ Error: ${err.message}`, keyboard: navBar('cmd_panic') };
  }
}

async function buildSignals(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  try {
    const res = await axios.get(`http://localhost:${PORT}/api/signals`);
    const signals: any[] = res.data || [];
    if (!signals.length) return { text: '📡 No signals yet. Run a cycle first.', keyboard: navBar('cmd_signals') };

    const sorted = [...signals].sort((a, b) => (b.combined_score ?? b.combined ?? 0) - (a.combined_score ?? a.combined ?? 0));
    const lines = ['📡 NARRATIVE SIGNALS', DIV];
    for (const s of sorted) {
      const score = s.combined_score ?? s.combined ?? 0;
      const emoji = signalEmoji(s.signal);
      lines.push(`${emoji} ${s.sector} — ${s.signal} (${score}/100)`);
    }
    if (sorted[0]?.reasoning) {
      lines.push(DIV, '🤖 AI Take:', sorted[0].reasoning);
    }
    lines.push(DIV, `Updated: ${timeAgo(sorted[0]?.created_at)} UTC`);
    return { text: lines.join('\n'), keyboard: navBar('cmd_signals') };
  } catch (err: any) {
    return { text: `❌ Error: ${err.message}`, keyboard: navBar('cmd_signals') };
  }
}

async function buildKeyInfo(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const keySet = sodexTrader.hasKey();
  const addr = sodexTrader.getWalletAddress();
  const lines = [
    '🔑 WALLET KEY INFO',
    DIV,
    keySet
      ? `Status: ✅ Key is set\nAddress: ${addr}`
      : 'Status: ❌ No key set',
    DIV,
    'To set your key, send:\n/setkey <your_private_key>',
    '',
    'Your message will be deleted immediately.',
    'Key stored on server — testnet use only.',
    DIV,
    keySet ? 'To remove key, send: /removekey' : '',
  ];
  const kb: InlineKeyboard = {
    inline_keyboard: [
      ...(keySet ? [[{ text: '🗑 Remove Key', callback_data: 'cmd_removekey' }]] : []),
      [{ text: '🏠 Menu', callback_data: 'cmd_menu' }],
    ]
  };
  return { text: lines.join('\n'), keyboard: kb };
}

// ── SoDEX deep-link helpers ───────────────────────────────────────────────────

function sodexTradeUrl(symbol?: string): string {
  // Format: BTC-USD → BTC_USDC
  const pair = symbol ? symbol.replace('-USD', '_USDC') : 'BTC_USDC';
  return `https://testnet.sodex.dev/trade/perps/${pair}`;
}

function sodexTradeKeyboard(symbol?: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: '🌐 Open SoDEX to trade', url: sodexTradeUrl(symbol) }],
      [{ text: '📊 Positions', callback_data: 'cmd_positions' }, { text: '🏠 Menu', callback_data: 'cmd_menu' }],
    ]
  };
}

// ── Trade execution handlers ──────────────────────────────────────────────────

async function executeClose(chatId: string | number, symbol: string): Promise<void> {
  await sendMessage(chatId, `⏳ Attempting to close ${symbol}...`);
  try {
    const { positions } = await sodex.getEnrichedPositions(WALLET);
    const pos = positions.find(p => p.symbol === symbol);
    const size = pos ? String(pos.positionSize) : '0';

    if (sodexTrader.hasKey()) {
      const result = await sodexTrader.closePosition(symbol, size);
      if (result.success) {
        await sendMessage(chatId,
          `✅ CLOSE ORDER SENT\n${DIV}\n${result.message}\n\nOrder ID: ${result.orderId || 'pending'}\n\nUse /positions to verify.`,
          navBar('cmd_positions')
        );
        return;
      }
    }

    // API unavailable — send direct link to SoDEX
    const entry = pos ? `$${parseFloat(String(pos.entryPrice || 0)).toFixed(2)}` : '--';
    const sz = pos ? String(pos.positionSize) : '--';
    await sendMessage(chatId,
      `⚠️ MANUAL CLOSE REQUIRED\n${DIV}\nSoDEX testnet does not expose a public order API.\n\nYour position:\nSymbol: ${symbol}\nSize: ${sz}\nEntry: ${entry}\n\nTap below to close on SoDEX directly 👇`,
      sodexTradeKeyboard(symbol)
    );
  } catch (err: any) {
    await sendMessage(chatId,
      `⚠️ MANUAL CLOSE REQUIRED\n${DIV}\n${symbol}\n\nTap below to trade on SoDEX directly 👇`,
      sodexTradeKeyboard(symbol)
    );
  }
}

async function executeOrder(chatId: string | number, symbol: string, side: 'BUY' | 'SELL', size: string, leverage: number): Promise<void> {
  await sendMessage(chatId, `⏳ Placing ${side} order for ${symbol}...`);

  if (sodexTrader.hasKey()) {
    const result = await sodexTrader.placeOrder({ symbol, side, type: 'MARKET', quantity: size, leverage });
    if (result.success) {
      await sendMessage(chatId,
        `✅ ORDER SENT\n${DIV}\n${side} ${size} ${symbol} @ ${leverage}x\n\nOrder ID: ${result.orderId || 'pending'}\n\nUse /positions to monitor.`,
        navBar('cmd_positions')
      );
      return;
    }
  }

  // API unavailable — send direct link to SoDEX
  await sendMessage(chatId,
    `⚠️ MANUAL ORDER REQUIRED\n${DIV}\nSoDEX testnet does not expose a public order API.\n\nYour order:\n${side} ${size} ${symbol} @ ${leverage}x MARKET\n\nTap below to place on SoDEX directly 👇`,
    sodexTradeKeyboard(symbol)
  );
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleCommand(chatId: string | number, command: string, args: string[] = []) {
  const cid = String(chatId);
  switch (command) {

    case '/start':
    case '/menu': {
      resetStep(cid);
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

    case '/panic': {
      await sendMessage(chatId, '⏳ Loading positions...');
      const { text, keyboard } = await buildPanicMode();
      await sendMessage(chatId, text, keyboard);
      break;
    }

    case '/signals': {
      await sendMessage(chatId, '⏳ Fetching signals...');
      const { text, keyboard } = await buildSignals();
      await sendMessage(chatId, text, keyboard);
      break;
    }

    // ── Trading commands ───────────────────────────────────────────────────────

    case '/buy':
    case '/trade': {
      resetStep(cid);
      setStep(cid, { type: 'buy_symbol' });
      await sendMessage(chatId,
        `🟢 BUY / LONG ORDER\n${DIV}\nEnter the symbol to trade.\n\nExamples: BTC-USD, ETH-USD, SOL-USD\n\nOr type /cancel to abort.`,
        cancelBar()
      );
      break;
    }

    case '/short':
    case '/sell': {
      resetStep(cid);
      setStep(cid, { type: 'buy_symbol' });
      await sendMessage(chatId,
        `🔴 SELL / SHORT ORDER\n${DIV}\nEnter the symbol to trade.\n\nExamples: BTC-USD, ETH-USD, SOL-USD\n\nOr type /cancel to abort.`,
        cancelBar()
      );
      break;
    }

    case '/close': {
      resetStep(cid);
      if (args[0]) {
        await executeClose(chatId, args[0].toUpperCase());
      } else {
        setStep(cid, { type: 'close_select' });
        await sendMessage(chatId, '⏳ Loading positions...');
        const { text, keyboard } = await buildPositionsOverview();
        await sendMessage(chatId, `❌ SELECT POSITION TO CLOSE\n${DIV}\n${text}`, keyboard);
      }
      break;
    }

    case '/reduce': {
      resetStep(cid);
      setStep(cid, { type: 'reduce_select' });
      await sendMessage(chatId, '⏳ Loading positions...');
      const { text, keyboard } = await buildPositionsOverview();
      await sendMessage(chatId, `📉 SELECT POSITION TO REDUCE LEVERAGE\n${DIV}\n${text}`, keyboard);
      break;
    }

    // ── Key management ─────────────────────────────────────────────────────────

    case '/setkey': {
      if (args[0]) {
        try {
          sodexTrader.saveKey(args[0]);
          const addr = sodexTrader.getWalletAddress();
          await sendMessage(chatId,
            `✅ PRIVATE KEY SET\n${DIV}\nWallet: ${addr}\n\nReady to execute trades on SoDEX testnet.\n\n⚠️ Testnet use only. Never share this key.`,
            navBar('cmd_menu')
          );
        } catch (err: any) {
          await sendMessage(chatId, `❌ Invalid private key: ${err.message}`, cancelBar());
        }
      } else {
        resetStep(cid);
        setStep(cid, { type: 'setkey' });
        await sendMessage(chatId,
          `🔑 SET PRIVATE KEY\n${DIV}\nSend your private key as the next message.\n\nIt will be stored on the EC2 server and deleted from chat immediately.\n\n⚠️ TESTNET USE ONLY. Never use your main wallet.\n\n/cancel to abort.`,
          cancelBar()
        );
      }
      break;
    }

    case '/removekey': {
      sodexTrader.removeKey();
      await sendMessage(chatId, `🗑 Private key removed.\n\nSend /setkey to add a new one.`, navBar('cmd_menu'));
      break;
    }

    case '/keyinfo': {
      const { text, keyboard } = await buildKeyInfo();
      await sendMessage(chatId, text, keyboard);
      break;
    }

    case '/cancel': {
      resetStep(cid);
      await sendMessage(chatId, '❌ Cancelled.', MAIN_MENU);
      break;
    }

    case '/status': {
      const keySet = sodexTrader.hasKey();
      const addr = sodexTrader.getWalletAddress();
      const lines = [
        '⚙️ SYSTEM STATUS',
        DIV,
        `Backend: ✅ Running`,
        `Wallet: ${WALLET ? WALLET.slice(0, 10) + '...' : '❌ Not set'}`,
        `Trading Key: ${keySet ? '✅ ' + addr?.slice(0, 10) + '...' : '❌ Not set'}`,
        `Network: SoDEX Testnet`,
        `Alert threshold: ${ALERT_THRESHOLD}/100`,
        DIV,
        `Use /setkey to enable trade execution`,
      ];
      await sendMessage(chatId, lines.join('\n'), navBar('cmd_status'));
      break;
    }

    case '/news': {
      await sendMessage(chatId, '⏳ Fetching news...');
      try {
        const news = await sosovalue.getNews(20);
        const raw: any[] = (news?.data as any[]) || news?.data?.list || [];
        const items = deduplicateNews(raw);
        if (!items.length) { await sendMessage(chatId, '📰 No news available.', navBar('cmd_news')); break; }
        const lines = ['<b>🗞 LATEST CRYPTO NEWS</b>', '─────────────────────'];
        items.slice(0, 8).forEach((n: any) => {
          const title = (n.title || n.content || '').replace(/<[^>]+>/g, '').trim();
          if (!title) return;
          const safe = escapeHtml(title.slice(0, 130));
          if (isHighImpactNews(title)) {
            lines.push(`\n⚡ <b>${safe}</b>`);
          } else {
            lines.push(`• ${safe}`);
          }
        });
        await sendMessage(chatId, lines.join('\n'), navBar('cmd_news'), 'HTML');
      } catch (err: any) {
        await sendMessage(chatId, `❌ Error: ${err.message}`, navBar('cmd_news'));
      }
      break;
    }

    case '/macro': {
      await sendMessage(chatId, '⏳ Fetching macro events...');
      try {
        const events = await sosovalue.getMacroEvents();
        const items: any[] = events?.data || [];
        if (!items.length) { await sendMessage(chatId, '📅 No macro events found.', navBar('cmd_macro')); break; }
        const lines = ['<b>📅 MACRO CALENDAR</b>', '─────────────────────'];
        const highImpact = items.filter((e: any) => HIGH_IMPACT.some(k => e.name?.toLowerCase().includes(k.toLowerCase())));
        const regular = items.filter((e: any) => !highImpact.includes(e));
        highImpact.slice(0, 5).forEach((e: any) => {
          const name = escapeHtml(e.name || 'Unknown');
          const time = escapeHtml(e.eventTime || e.date || 'TBD');
          lines.push(`\n⚡ <b>${name}</b>\n   🕐 ${time}`);
        });
        if (highImpact.length === 0) {
          regular.slice(0, 6).forEach((e: any) => lines.push(`• ${escapeHtml(e.name || 'Unknown')}`));
        } else if (regular.length > 0) {
          lines.push('\n<b>Other Events</b>');
          regular.slice(0, 3).forEach((e: any) => lines.push(`• ${escapeHtml(e.name || 'Unknown')}`));
        }
        await sendMessage(chatId, lines.join('\n'), navBar('cmd_macro'), 'HTML');
      } catch (err: any) {
        await sendMessage(chatId, `❌ Error: ${err.message}`, navBar('cmd_macro'));
      }
      break;
    }

    case '/summary': {
      await sendMessage(chatId, '⏳ Fetching AI summary...');
      try {
        const res = await axios.get(`http://localhost:${PORT}/api/memos`);
        const memos: any[] = res.data || [];
        const lines = ['🤖 AI MARKET BRIEFS', DIV];
        if (!memos.length) { lines.push('No memos yet. Run a cycle first.'); }
        else memos.slice(0, 3).forEach(m => {
          lines.push(`[${m.memo_type} — ${m.related_symbol || 'general'}]`);
          lines.push(m.content || '');
          lines.push('');
        });
        await sendMessage(chatId, lines.join('\n'), navBar('cmd_summary'));
      } catch (err: any) {
        await sendMessage(chatId, `❌ Error: ${err.message}`, navBar('cmd_summary'));
      }
      break;
    }

    case '/help': {
      const keySet = sodexTrader.hasKey();
      const lines = [
        '❓ SENTINEL BOT COMMANDS',
        DIV,
        '📊 PORTFOLIO',
        '/positions  — View all open positions',
        '/risk       — Risk overview with scores',
        '/panic      — Emergency close all',
        '',
        '💹 TRADING (SoDEX Testnet)',
        '/buy        — Place long/buy order',
        '/sell       — Place short/sell order',
        '/close [sym]— Close a position',
        '/reduce     — Reduce leverage',
        '',
        '🔑 KEY MANAGEMENT',
        '/setkey     — Add private key for trading',
        '/removekey  — Remove stored key',
        '/keyinfo    — Key status',
        '',
        '📡 INTEL',
        '/signals    — AI sector signals',
        '/news       — Latest crypto news',
        '/macro      — High-impact events',
        '/summary    — AI market brief',
        '',
        '⚙️ SYSTEM',
        '/status     — System status',
        '/menu       — Main menu',
        '',
        DIV,
        `Key status: ${keySet ? '✅ Set and ready' : '❌ Not set — /setkey to enable trading'}`,
      ];
      await sendMessage(chatId, lines.join('\n'), navBar('cmd_help'));
      break;
    }

    default: {
      await sendMessage(chatId, `Unknown command. Send /help for a list of commands.`, MAIN_MENU);
    }
  }
}

// ── Conversation step handler (text messages) ─────────────────────────────────

async function handleConversationStep(chatId: string, text: string, msgId: number) {
  const step = getStep(chatId);

  if (step.type === 'setkey') {
    // Delete the message immediately for security
    await deleteMessage(chatId, msgId);
    resetStep(chatId);
    const key = text.trim();
    try {
      sodexTrader.saveKey(key);
      const addr = sodexTrader.getWalletAddress();
      await sendMessage(chatId,
        `✅ PRIVATE KEY SET\n${DIV}\nWallet: ${addr}\n\n⚠️ Message deleted. Key stored securely.\n\nReady to execute trades on SoDEX testnet.`,
        navBar('cmd_menu')
      );
    } catch (err: any) {
      await sendMessage(chatId, `❌ Invalid key: ${err.message}\n\nSend /setkey to try again.`, MAIN_MENU);
    }
    return;
  }

  if (step.type === 'buy_symbol') {
    const symbol = text.trim().toUpperCase().replace('/', '-');
    setStep(chatId, { type: 'buy_side', symbol });
    await sendMessage(chatId,
      `${symbol}\n${DIV}\nChoose direction:`,
      sideKeyboard(symbol)
    );
    return;
  }

  if (step.type === 'buy_size') {
    const size = parseFloat(text.trim());
    if (isNaN(size) || size <= 0) {
      await sendMessage(chatId, '❌ Invalid size. Enter a positive number.\n\nExamples: 0.01, 100, 1000', cancelBar());
      return;
    }
    setStep(chatId, { type: 'buy_leverage', symbol: step.symbol, side: step.side, size: String(size) });
    await sendMessage(chatId,
      `${step.side} ${size} ${step.symbol}\n${DIV}\nChoose leverage:`,
      leverageSelectKeyboard(step.symbol, step.side)
    );
    return;
  }

  if (step.type === 'reduce_leverage') {
    const lev = parseInt(text.trim(), 10);
    if (isNaN(lev) || lev < 1 || lev >= step.currentLeverage) {
      await sendMessage(chatId, `❌ Enter a leverage less than current (${step.currentLeverage}x). Example: 5`, cancelBar());
      return;
    }
    setStep(chatId, { type: 'reduce_confirm', symbol: step.symbol, newLeverage: lev });
    await sendMessage(chatId,
      `📉 CONFIRM REDUCE LEVERAGE\n${DIV}\nSymbol: ${step.symbol}\nCurrent: ${step.currentLeverage}x → New: ${lev}x\n\nConfirm?`,
      confirmBar(`confirm_reduce_${step.symbol.replace(/[^A-Za-z0-9]/g, '_')}_${lev}`)
    );
    return;
  }
}

// ── Callback query handler ────────────────────────────────────────────────────

async function handleCallbackQuery(queryId: string, chatId: string | number, msgId: number, data: string) {
  await answerCallback(queryId);
  const cid = String(chatId);

  // pos_detail_SYMBOL
  if (data.startsWith('pos_detail_')) {
    const symbol = data.replace('pos_detail_', '').replace(/_/g, '-');
    await sendMessage(chatId, '⏳ Loading...');
    const { text, keyboard } = await buildPositionDetail(symbol);
    await sendMessage(chatId, text, keyboard);
    return;
  }

  // trade_close_SYMBOL — execute or prompt for key
  if (data.startsWith('trade_close_')) {
    const symbol = data.replace('trade_close_', '').replace(/_/g, '-');
    await executeClose(chatId, symbol);
    return;
  }

  // trade_reduce_SYMBOL — start reduce leverage flow
  if (data.startsWith('trade_reduce_')) {
    const symbol = data.replace('trade_reduce_', '').replace(/_/g, '-');
    try {
      const { positions } = await sodex.getEnrichedPositions(WALLET);
      const pos = positions.find(p => p.symbol === symbol);
      const currentLev = parseFloat(String(pos?.leverage || 1));
      setStep(cid, { type: 'reduce_leverage', symbol, currentLeverage: currentLev });
      await sendMessage(chatId,
        `📉 REDUCE LEVERAGE — ${symbol}\n${DIV}\nCurrent: ${currentLev}x\n\nTap a new leverage or type a number:`,
        leverageKeyboard(symbol, currentLev)
      );
    } catch (err: any) {
      await sendMessage(chatId, `❌ Error: ${err.message}`, navBar('cmd_positions'));
    }
    return;
  }

  // set_lev_SYMBOL_N — leverage button selected
  if (data.startsWith('set_lev_')) {
    const parts = data.replace('set_lev_', '').split('_');
    const lev = parseInt(parts[parts.length - 1], 10);
    const symbol = parts.slice(0, -1).join('-');
    resetStep(cid);
    await sendMessage(chatId, `⏳ Reducing leverage to ${lev}x on ${symbol}...`);
    const result = await sodexTrader.reduceLeverage(symbol, lev);
    await sendMessage(chatId,
      result.success
        ? `✅ LEVERAGE CHANGED\n${DIV}\n${result.message}`
        : `❌ FAILED\n${DIV}\n${result.message}`,
      navBar('cmd_positions')
    );
    return;
  }

  // order_side_SYMBOL_SIDE — direction chosen in buy flow
  if (data.startsWith('order_side_')) {
    const parts = data.replace('order_side_', '').split('_');
    const side = parts[parts.length - 1] as 'BUY' | 'SELL';
    const symbol = parts.slice(0, -1).join('-');
    setStep(cid, { type: 'buy_size', symbol, side });
    await sendMessage(chatId,
      `${side === 'BUY' ? '🟢 LONG' : '🔴 SHORT'} ${symbol}\n${DIV}\nEnter position size:\n\nExamples:\n  0.01 (for BTC)\n  100 (for smaller coins)`,
      cancelBar()
    );
    return;
  }

  // order_lev_SYMBOL_SIDE_LEV — leverage chosen
  if (data.startsWith('order_lev_')) {
    const parts = data.replace('order_lev_', '').split('_');
    const lev = parseInt(parts[parts.length - 1], 10);
    const side = parts[parts.length - 2] as 'BUY' | 'SELL';
    const symbol = parts.slice(0, -2).join('-');
    const step = getStep(cid);
    const size = step.type === 'buy_leverage' ? step.size : '0';
    setStep(cid, { type: 'buy_confirm', symbol, side, size, leverage: lev });
    await sendMessage(chatId,
      `📋 CONFIRM ORDER\n${DIV}\nSymbol: ${symbol}\nSide: ${side === 'BUY' ? '🟢 LONG' : '🔴 SHORT'}\nSize: ${size}\nLeverage: ${lev}x\nType: MARKET\n${DIV}\nConfirm?`,
      confirmBar(`confirm_order_${symbol.replace(/[^A-Za-z0-9]/g, '_')}_${side}_${size.replace('.', 'p')}_${lev}`)
    );
    return;
  }

  // confirm_order_SYMBOL_SIDE_SIZE_LEV
  if (data.startsWith('confirm_order_')) {
    const payload = data.replace('confirm_order_', '');
    const parts = payload.split('_');
    const lev = parseInt(parts[parts.length - 1], 10);
    const size = parts[parts.length - 2].replace('p', '.');
    const side = parts[parts.length - 3] as 'BUY' | 'SELL';
    const symbol = parts.slice(0, -3).join('-');
    resetStep(cid);
    await executeOrder(chatId, symbol, side, size, lev);
    return;
  }

  // confirm_reduce_SYMBOL_LEV
  if (data.startsWith('confirm_reduce_')) {
    const payload = data.replace('confirm_reduce_', '');
    const parts = payload.split('_');
    const lev = parseInt(parts[parts.length - 1], 10);
    const symbol = parts.slice(0, -1).join('-');
    resetStep(cid);
    await sendMessage(chatId, `⏳ Reducing leverage to ${lev}x on ${symbol}...`);
    const result = await sodexTrader.reduceLeverage(symbol, lev);
    await sendMessage(chatId,
      result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
      navBar('cmd_positions')
    );
    return;
  }

  // action_margin_SYMBOL
  if (data.startsWith('action_margin_')) {
    const symbol = data.replace('action_margin_', '').replace(/_/g, '-');
    await sendMessage(chatId,
      `💰 ADD MARGIN — ${symbol}\n${DIV}\nTo add margin on SoDEX testnet:\n1. Go to sodex.dev\n2. Open your ${symbol} position\n3. Click "Add Margin"\n\nMargin is added from your vUSDC balance.`,
      navBar('cmd_risk')
    );
    return;
  }

  // cmd_removekey
  if (data === 'cmd_removekey') {
    sodexTrader.removeKey();
    await sendMessage(chatId, `🗑 Private key removed.`, navBar('cmd_menu'));
    return;
  }

  // cmd_cancel
  if (data === 'cmd_cancel') {
    resetStep(cid);
    await sendMessage(chatId, '❌ Cancelled.', MAIN_MENU);
    return;
  }

  // Generic cmd_ → command router
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
    const msgId: number = msg.message_id;
    if (authorizedId && chatId !== authorizedId) return;

    if (text.startsWith('/')) {
      const parts = text.split(' ');
      const command = parts[0].toLowerCase().split('@')[0];
      const args = parts.slice(1);
      await handleCommand(chatId, command, args);
    } else if (text.trim()) {
      await handleConversationStep(chatId, text, msgId);
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
  if (!base || polling) return;
  polling = true;
  try {
    const res = await axios.get(`${base}/getUpdates`, {
      params: { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] },
      timeout: 30000
    });
    const updates: any[] = res.data?.result || [];
    for (const u of updates) {
      offset = u.update_id + 1;
      handleUpdate(u).catch(() => {});
    }
  } catch { }
  finally {
    polling = false;
    setTimeout(poll, 500);
  }
}

export function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) { console.warn('[TelegramBot] No TELEGRAM_BOT_TOKEN set.'); return; }
  if (!chatId) { console.warn('[TelegramBot] No TELEGRAM_CHAT_ID set.'); return; }
  console.log('[TelegramBot] Polling started. Send /menu to your bot.');
  poll();
}

// ── Outbound alert helpers (used by agents) ───────────────────────────────────

async function sendToChat(text: string): Promise<boolean> {
  const chatId = authorizedChatId();
  if (!chatId) return false;
  const result = await sendMessage(chatId, text);
  return !!result;
}

export { sendToChat };
