const axios = require('axios');
const { delay } = require('../utils/delay');

const BASE_URL = process.env.SOSOVALUE_BASE_URL || 'https://openapi.sosovalue.com/openapi/v1';
const RATE_LIMIT_MS = 500;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000
});

let lastRequestAt = 0;
let requestQueue = Promise.resolve();

function getHeaders() {
  const apiKey = process.env.SOSOVALUE_API_KEY;

  if (!apiKey) {
    throw new Error('SOSOVALUE_API_KEY is not configured.');
  }

  return { 'x-soso-api-key': apiKey };
}

function getErrorStatus(error) {
  return error?.response?.status || null;
}

function createUnavailableResponse(message, data) {
  return {
    code: -1,
    message,
    data
  };
}

async function get(path, params) {
  const nextRequest = requestQueue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;

    if (elapsed < RATE_LIMIT_MS) {
      await delay(RATE_LIMIT_MS - elapsed);
    }

    try {
      const response = await client.get(path, {
        headers: getHeaders(),
        params
      });

      return response.data;
    } finally {
      lastRequestAt = Date.now();
    }
  });

  requestQueue = nextRequest.then(
    () => undefined,
    () => undefined
  );

  return nextRequest;
}

async function getWithFallback(paths, params, options = {}) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  let lastError = null;

  for (const path of uniquePaths) {
    try {
      return await get(path, params);
    } catch (error) {
      lastError = error;

      if (getErrorStatus(error) !== 404) {
        throw error;
      }
    }
  }

  if (options.allowUnavailable) {
    console.warn(
      `[SoSoValue] No working endpoint found for ${options.name || 'request'}. Tried: ${uniquePaths.join(', ')}`
    );

    return createUnavailableResponse(
      options.unavailableMessage || `${options.name || 'Request'} endpoint is unavailable.`,
      options.defaultData
    );
  }

  throw lastError || new Error(`${options.name || 'request'} failed without a response.`);
}

function normalizeNewsResponse(response) {
  const list = response?.data?.list;

  if (Array.isArray(list)) {
    return {
      ...response,
      data: list,
      meta: {
        page: response?.data?.page ?? null,
        pageSize: response?.data?.page_size ?? null,
        total: response?.data?.total ?? null
      }
    };
  }

  if (Array.isArray(response?.data)) {
    return response;
  }

  return {
    ...response,
    data: []
  };
}

function normalizeEtfSummaryResponse(response) {
  const payload = response?.data;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return response;
  }

  return {
    ...response,
    data: {
      netFlow7Day: 0,
      netFlow: 0,
      unavailable: true,
      raw: payload ?? null
    }
  };
}

const newsPaths = [process.env.SOSOVALUE_NEWS_PATH, '/news', '/feeds'];
const etfListPaths = [
  process.env.SOSOVALUE_ETF_LIST_PATH,
  '/etf/list',
  '/etf',
  '/spot-etf/list',
  '/etf/spot/list'
];
const etfSummaryPaths = [
  process.env.SOSOVALUE_ETF_SUMMARY_HISTORY_PATH,
  '/etf/summary-history',
  '/etf/history',
  '/etf/summaryHistory',
  '/etf/summary',
  '/spot-etf/summary-history',
  '/etf/spot/summary-history'
];
const ssiPaths = [
  process.env.SOSOVALUE_SSI_LIST_PATH,
  '/sosovalue-index/list',
  '/sosovalue-index',
  '/ssi/list',
  '/indices/list'
];
const fundraisingPaths = [
  process.env.SOSOVALUE_FUNDRAISING_PATH,
  '/fundraising/list',
  '/fundraising',
  '/fundraisings',
  '/funding/list'
];
const coinMarketPaths = [
  process.env.SOSOVALUE_COIN_MARKET_PATH,
  '/currencies/market-data',
  '/currency/market-data',
  '/coins/market-data'
];

function resolveCurrencyParams(input) {
  if (typeof input === 'object' && input !== null) {
    return {
      currency_id: input.currency_id || input.currencyId || input.id || input.symbol || input.currencyCode
    };
  }

  return { currency_id: input };
}

const sosovalue = {
  async getNews(limit = 20) {
    const response = await getWithFallback(newsPaths, { limit }, { name: 'news' });
    return normalizeNewsResponse(response);
  },

  async getETFFlows() {
    return getWithFallback(etfListPaths, undefined, {
      name: 'ETF flows',
      allowUnavailable: true,
      unavailableMessage: 'ETF list endpoint is unavailable.',
      defaultData: []
    });
  },

  async getETFSummaryHistory(days = 7) {
    const response = await getWithFallback(etfSummaryPaths, { days }, {
      name: 'ETF summary history',
      allowUnavailable: true,
      unavailableMessage: 'ETF summary history endpoint is unavailable.',
      defaultData: {
        netFlow7Day: 0,
        netFlow: 0,
        unavailable: true
      }
    });

    return normalizeEtfSummaryResponse(response);
  },

  async getMacroEvents(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return get('/macro/events', { date: targetDate });
  },

  async getMacroEventHistory(eventName) {
    return get(`/macro/events/${encodeURIComponent(eventName)}/history`);
  },

  async getSSIList() {
    return getWithFallback(ssiPaths, undefined, {
      name: 'SoSoValue index list',
      allowUnavailable: true,
      unavailableMessage: 'SoSoValue index endpoint is unavailable.',
      defaultData: []
    });
  },

  async getFundraising() {
    return getWithFallback(fundraisingPaths, undefined, {
      name: 'fundraising list',
      allowUnavailable: true,
      unavailableMessage: 'Fundraising endpoint is unavailable.',
      defaultData: []
    });
  },

  async getCoinMarketData(currencyIdentifier) {
    const params = resolveCurrencyParams(currencyIdentifier);
    return getWithFallback(coinMarketPaths, params, {
      name: 'coin market data'
    });
  },

  async getSectorSpotlight() {
    return getWithFallback(['/currencies/sector-spotlight'], undefined, {
      name: 'sector spotlight',
      allowUnavailable: true,
      unavailableMessage: 'Sector spotlight endpoint is unavailable.',
      defaultData: { sector: [], spotlight: [] }
    });
  },

  async getMarketSnapshot(currencyId) {
    if (!currencyId) {
      throw new Error('currencyId is required for getMarketSnapshot().');
    }

    return get(`/currencies/${encodeURIComponent(currencyId)}/market-snapshot`);
  },

  async getHotNews() {
    return getWithFallback(['/feeds/hot-news', '/news/hot'], undefined, {
      name: 'hot news',
      allowUnavailable: true,
      unavailableMessage: 'Hot news endpoint is unavailable.',
      defaultData: []
    });
  },

  async getEventHistory(eventName) {
    if (!eventName) {
      throw new Error('eventName is required for getEventHistory().');
    }

    return get(`/macro/events/${encodeURIComponent(eventName)}/history`);
  }
};

module.exports = sosovalue;
