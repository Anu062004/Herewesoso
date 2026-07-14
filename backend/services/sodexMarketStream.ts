type SodexNetwork = 'testnet' | 'mainnet';

const WebSocketClient = require('ws');

interface MarketTick {
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  openInterest: number;
  updatedAt: string;
}

const ticks = new Map<string, MarketTick>();
const sockets = new Map<SodexNetwork, any>();
const reconnectTimers = new Map<SodexNetwork, ReturnType<typeof setTimeout>>();
let stopped = true;

function key(network: SodexNetwork, symbol: string) {
  return `${network}:${symbol.toUpperCase()}`;
}

function url(network: SodexNetwork) {
  return network === 'mainnet' ? 'wss://mainnet-gw.sodex.dev/ws/perps' : 'wss://testnet-gw.sodex.dev/ws/perps';
}

function number(value: unknown) {
  return Number.parseFloat(String(value ?? '0')) || 0;
}

function scheduleReconnect(network: SodexNetwork) {
  if (stopped) return;
  if (reconnectTimers.has(network)) return;
  reconnectTimers.set(network, setTimeout(() => {
    reconnectTimers.delete(network);
    connect(network);
  }, 5000));
}

function connect(network: SodexNetwork) {
  if (stopped) return;
  const existing = sockets.get(network);
  if (existing && (existing.readyState === 0 || existing.readyState === 1)) return;
  const socket = new WebSocketClient(url(network));
  sockets.set(network, socket);
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  socket.on('open', () => {
    socket.send(JSON.stringify({ op: 'subscribe', id: Date.now(), params: { channel: 'allMarkPrice' } }));
    heartbeat = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ op: 'ping' }));
    }, 45000);
  });
  socket.on('message', (payload: any) => {
    try {
      const message = JSON.parse(String(payload));
      if (message.channel !== 'allMarkPrice' || !Array.isArray(message.data)) return;
      for (const row of message.data) {
        const symbol = String(row.s || row.symbol || '');
        if (!symbol) continue;
        ticks.set(key(network, symbol), {
          markPrice: number(row.p ?? row.markPrice),
          indexPrice: number(row.i ?? row.indexPrice),
          fundingRate: number(row.r ?? row.fundingRate),
          openInterest: number(row.oi ?? row.openInterest),
          updatedAt: new Date(number(row.E) || Date.now()).toISOString()
        });
      }
    } catch {
      // Ignore malformed upstream frames; the next update will replace them.
    }
  });
  socket.on('close', () => {
    if (heartbeat) clearInterval(heartbeat);
    sockets.delete(network);
    scheduleReconnect(network);
  });
  socket.on('error', () => socket.close());
}

function start() {
  if (!stopped) return;
  stopped = false;
  connect('testnet');
  connect('mainnet');
}

function stop() {
  stopped = true;
  reconnectTimers.forEach((timer) => clearTimeout(timer));
  reconnectTimers.clear();
  sockets.forEach((socket) => {
    try { socket.close(); } catch {}
  });
  sockets.clear();
}

function getMarketTick(symbol: string, network: SodexNetwork): MarketTick | null {
  return ticks.get(key(network, symbol)) || null;
}

function status(network: SodexNetwork) {
  const socket = sockets.get(network);
  return { connected: socket?.readyState === 1, tickCount: [...ticks.keys()].filter((item) => item.startsWith(`${network}:`)).length };
}

export = { start, stop, getMarketTick, status };
