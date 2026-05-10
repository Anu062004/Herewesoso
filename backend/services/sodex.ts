import type { AccountState, EnrichedPosition, ShieldState } from '../types/domain';

import axios from 'axios';

type QueryParams = Record<string, string | number> | undefined;
type RawRecord = Record<string, any>;

const DEFAULT_PERPS = 'https://testnet-gw.sodex.dev/api/v1/perps';
const DEFAULT_SPOT = 'https://testnet-gw.sodex.dev/api/v1/spot';

const client = axios.create({
  timeout: 15000,
  headers: {
    Accept: 'application/json'
  }
});

function perpsBaseUrl(): string {
  return process.env.SODEX_TESTNET_PERPS || DEFAULT_PERPS;
}

function spotBaseUrl(): string {
  return process.env.SODEX_TESTNET_SPOT || DEFAULT_SPOT;
}

async function get<T = unknown>(baseUrl: string, path: string, params?: QueryParams): Promise<T> {
  const response = await client.get<T>(`${baseUrl}${path}`, { params });
  return response.data;
}

function parseNumber(value: string | number | null | undefined): number {
  return Number.parseFloat(String(value ?? '0')) || 0;
}

function normalizeAccountState(raw: RawRecord): AccountState | null {
  const data = raw?.data;

  if (!data) return null;

  const positions = ((data.P || []) as RawRecord[]).map((position) => ({
    id: position.i,
    symbol: position.s,
    marginMode: position.m,
    positionSide: position.ps,
    size: position.sz,
    entryPrice: position.ep,
    liquidationPrice: position.lp,
    leverage: position.l,
    unrealizedPnL: position.ur,
    realizedPnL: position.cr,
    createdAt: position.ct,
    updatedAt: position.ut
  }));

  const balances = ((data.B || []) as RawRecord[]).map((balance) => ({
    coin: balance.a,
    walletBalance: balance.wb,
    availableBalance: balance.am,
    availableWithdraw: balance.aw
  }));

  return {
    user: data.user,
    accountId: data.aid,
    accountValue: parseNumber(data.av),
    availableMargin: parseNumber(data.am),
    initialMargin: parseNumber(data.im),
    crossMargin: parseNumber(data.cm),
    walletAddress: data.user,
    positions,
    balances,
    raw: data
  };
}

function normalizePositions(raw: RawRecord): EnrichedPosition[] {
  const positions = (raw?.data?.positions || raw?.data || []) as RawRecord[];

  if (!Array.isArray(positions)) return [];

  return positions
    .filter((position) => position.active !== false)
    .map((position) => ({
      id: position.id,
      symbol: position.symbol,
      marginMode: position.marginMode,
      positionSide: position.positionSide || 'BOTH',
      side: position.positionSide === 'SHORT' ? 'SHORT' : 'LONG',
      positionSize: position.size,
      entryPrice: position.avgEntryPrice,
      markPrice: null,
      liquidationPrice: position.liquidationPrice || position.takeOverPrice || null,
      leverage: position.leverage,
      realizedPnL: position.realizedPnL,
      createdAt: position.createdAt,
      updatedAt: position.updatedAt,
      active: position.active
    }));
}

const sodex = {
  async getPositions(walletAddress: string) {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getPositions().');
    }

    return get(perpsBaseUrl(), `/accounts/${walletAddress}/positions`);
  },

  async getEnrichedPositions(walletAddress: string): Promise<ShieldState> {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getEnrichedPositions().');
    }

    const [positionsRaw, stateRaw, markPricesRaw] = await Promise.all([
      get<RawRecord>(perpsBaseUrl(), `/accounts/${walletAddress}/positions`),
      get<RawRecord>(perpsBaseUrl(), `/accounts/${walletAddress}/state`),
      get<RawRecord>(perpsBaseUrl(), '/markets/mark-prices')
    ]);

    const positions = normalizePositions(positionsRaw);
    const statePositions = (stateRaw?.data?.P || []) as RawRecord[];
    const markPrices = (markPricesRaw?.data || []) as RawRecord[];
    const liquidationPriceMap = new Map<string, string | number | null>();
    const markPriceMap = new Map<string, string | number | null>();

    for (const position of statePositions) {
      liquidationPriceMap.set(position.s, position.lp);
    }

    for (const markPrice of markPrices) {
      markPriceMap.set(markPrice.symbol, markPrice.markPrice);
    }

    for (const position of positions) {
      position.markPrice = markPriceMap.get(position.symbol) || position.markPrice || null;
      position.liquidationPrice =
        position.liquidationPrice || liquidationPriceMap.get(position.symbol) || null;
    }

    return {
      positions,
      accountState: normalizeAccountState(stateRaw)
    };
  },

  async getMarkPrices(symbol: string | null = null) {
    return get(perpsBaseUrl(), '/markets/mark-prices', symbol ? { symbol } : undefined);
  },

  async getBalances(walletAddress: string) {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getBalances().');
    }

    return get(perpsBaseUrl(), `/accounts/${walletAddress}/balances`);
  },

  async getAccountState(walletAddress: string): Promise<{ data: AccountState | null; raw: unknown }> {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getAccountState().');
    }

    const raw = await get<RawRecord>(perpsBaseUrl(), `/accounts/${walletAddress}/state`);

    return {
      data: normalizeAccountState(raw),
      raw
    };
  },

  async getOrderbook(symbol: string, limit = 20) {
    if (!symbol) {
      throw new Error('symbol is required for getOrderbook().');
    }

    return get(perpsBaseUrl(), `/markets/${symbol}/orderbook`, { limit });
  },

  async getKlines(symbol: string, interval = '1h', limit = 100) {
    if (!symbol) {
      throw new Error('symbol is required for getKlines().');
    }

    return get(perpsBaseUrl(), `/markets/${symbol}/klines`, { interval, limit });
  },

  async getFundingHistory(walletAddress: string, symbol?: string) {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getFundingHistory().');
    }

    return get(perpsBaseUrl(), `/accounts/${walletAddress}/fundings`, symbol ? { symbol } : undefined);
  },

  async getSymbols() {
    return get(perpsBaseUrl(), '/markets/symbols');
  },

  async getSpotMarkets() {
    return get(spotBaseUrl(), '/markets');
  },

  normalizeAccountState,
  normalizePositions
};

export = sodex;
