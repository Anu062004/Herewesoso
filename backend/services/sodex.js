const axios = require('axios');

const DEFAULT_PERPS = 'https://testnet-gw.sodex.dev/api/v1/perps';
const DEFAULT_SPOT = 'https://testnet-gw.sodex.dev/api/v1/spot';

const client = axios.create({
  timeout: 15000,
  headers: {
    Accept: 'application/json'
  }
});

function perpsBaseUrl() {
  return process.env.SODEX_TESTNET_PERPS || DEFAULT_PERPS;
}

function spotBaseUrl() {
  return process.env.SODEX_TESTNET_SPOT || DEFAULT_SPOT;
}

async function get(baseUrl, path, params) {
  const response = await client.get(`${baseUrl}${path}`, { params });
  return response.data;
}

function normalizeAccountState(raw) {
  const data = raw?.data;

  if (!data) return null;

  const positions = (data.P || []).map((position) => ({
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

  const balances = (data.B || []).map((balance) => ({
    coin: balance.a,
    walletBalance: balance.wb,
    availableBalance: balance.am,
    availableWithdraw: balance.aw
  }));

  return {
    user: data.user,
    accountId: data.aid,
    accountValue: parseFloat(data.av || '0'),
    availableMargin: parseFloat(data.am || '0'),
    initialMargin: parseFloat(data.im || '0'),
    crossMargin: parseFloat(data.cm || '0'),
    walletAddress: data.user,
    positions,
    balances,
    raw: data
  };
}

function normalizePositions(raw) {
  const positions = raw?.data?.positions || raw?.data || [];

  if (!Array.isArray(positions)) return [];

  return positions.filter((position) => position.active !== false).map((position) => ({
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
  async getPositions(walletAddress) {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getPositions().');
    }

    return get(perpsBaseUrl(), `/accounts/${walletAddress}/positions`);
  },

  async getEnrichedPositions(walletAddress) {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getEnrichedPositions().');
    }

    const [positionsRaw, stateRaw, markPricesRaw] = await Promise.all([
      get(perpsBaseUrl(), `/accounts/${walletAddress}/positions`),
      get(perpsBaseUrl(), `/accounts/${walletAddress}/state`),
      get(perpsBaseUrl(), '/markets/mark-prices')
    ]);

    const positions = normalizePositions(positionsRaw);
    const statePositions = stateRaw?.data?.P || [];
    const markPrices = markPricesRaw?.data || [];
    const liquidationPriceMap = new Map();
    const markPriceMap = new Map();

    for (const position of statePositions) {
      liquidationPriceMap.set(position.s, position.lp);
    }

    for (const markPrice of markPrices) {
      markPriceMap.set(markPrice.symbol, markPrice.markPrice);
    }

    for (const position of positions) {
      position.markPrice = markPriceMap.get(position.symbol) || position.markPrice;
      position.liquidationPrice =
        position.liquidationPrice || liquidationPriceMap.get(position.symbol) || null;
    }

    return {
      positions,
      accountState: normalizeAccountState(stateRaw)
    };
  },

  async getMarkPrices(symbol = null) {
    return get(perpsBaseUrl(), '/markets/mark-prices', symbol ? { symbol } : undefined);
  },

  async getBalances(walletAddress) {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getBalances().');
    }

    return get(perpsBaseUrl(), `/accounts/${walletAddress}/balances`);
  },

  async getAccountState(walletAddress) {
    if (!walletAddress) {
      throw new Error('walletAddress is required for getAccountState().');
    }

    const raw = await get(perpsBaseUrl(), `/accounts/${walletAddress}/state`);

    return {
      data: normalizeAccountState(raw),
      raw
    };
  },

  async getOrderbook(symbol, limit = 20) {
    if (!symbol) {
      throw new Error('symbol is required for getOrderbook().');
    }

    return get(perpsBaseUrl(), `/markets/${symbol}/orderbook`, { limit });
  },

  async getKlines(symbol, interval = '1h', limit = 100) {
    if (!symbol) {
      throw new Error('symbol is required for getKlines().');
    }

    return get(perpsBaseUrl(), `/markets/${symbol}/klines`, { interval, limit });
  },

  async getFundingHistory(walletAddress, symbol) {
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

module.exports = sodex;
