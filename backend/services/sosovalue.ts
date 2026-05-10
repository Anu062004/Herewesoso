import type { MacroEvent, SosoResponse } from '../types/domain';

import axios from 'axios';
import delayUtils = require('../utils/delay');

const { delay } = delayUtils;

type QueryParams = Record<string, unknown> | undefined;
type CurrencyIdentifier =
  | string
  | {
      currency_id?: string;
      currencyId?: string;
      id?: string;
      symbol?: string;
      currencyCode?: string;
    };

interface FallbackOptions {
  name?: string;
  allowUnavailable?: boolean;
  unavailableMessage?: string;
  defaultData?: unknown;
}

const BASE_URL = process.env.SOSOVALUE_BASE_URL || 'https://openapi.sosovalue.com/openapi/v1';
const RATE_LIMIT_MS = 500;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000
});

let lastRequestAt = 0;
let requestQueue: Promise<unknown> = Promise.resolve();

function getHeaders(): Record<'x-soso-api-key', string> {
  const apiKey = process.env.SOSOVALUE_API_KEY;

  if (!apiKey) {
    throw new Error('SOSOVALUE_API_KEY is not configured.');
  }

  return { 'x-soso-api-key': apiKey };
}

function getErrorStatus(error: unknown): number | null {
  return axios.isAxiosError(error) ? error.response?.status || null : null;
}

function createUnavailableResponse(message: string, data: unknown): SosoResponse<unknown> {
  return {
    code: -1,
    message,
    data
  };
}

async function get<T = unknown>(path: string, params?: QueryParams): Promise<T> {
  const nextRequest = requestQueue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;

    if (elapsed < RATE_LIMIT_MS) {
      await delay(RATE_LIMIT_MS - elapsed);
    }

    try {
      const response = await client.get<T>(path, {
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

async function getWithFallback<T = unknown>(
  paths: Array<string | undefined>,
  params?: QueryParams,
  options: FallbackOptions = {}
): Promise<T> {
  const uniquePaths = [...new Set(paths.filter(Boolean))] as string[];
  let lastError: unknown = null;

  for (const path of uniquePaths) {
    try {
      return await get<T>(path, params);
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
    ) as T;
  }

  throw lastError || new Error(`${options.name || 'request'} failed without a response.`);
}

function normalizeNewsResponse(response: SosoResponse<unknown>): SosoResponse<unknown[]> {
  const responseData = response?.data as
    | { list?: unknown[]; page?: number; page_size?: number; total?: number }
    | unknown[]
    | undefined;

  if (responseData && !Array.isArray(responseData) && Array.isArray(responseData.list)) {
    return {
      ...response,
      data: responseData.list,
      meta: {
        page: responseData.page ?? null,
        pageSize: responseData.page_size ?? null,
        total: responseData.total ?? null
      }
    };
  }

  if (Array.isArray(responseData)) {
    return {
      ...response,
      data: responseData
    };
  }

  return {
    ...response,
    data: []
  };
}

function normalizeEtfSummaryResponse(
  response: SosoResponse<unknown>
): SosoResponse<Record<string, unknown>> {
  const payload = response?.data;

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return response as SosoResponse<Record<string, unknown>>;
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

function resolveCurrencyParams(input: CurrencyIdentifier): Record<string, string | undefined> {
  if (typeof input === 'object' && input !== null) {
    return {
      currency_id:
        input.currency_id || input.currencyId || input.id || input.symbol || input.currencyCode
    };
  }

  return { currency_id: input };
}

const sosovalue = {
  async getNews(limit = 20): Promise<SosoResponse<unknown[]>> {
    const response = await getWithFallback<SosoResponse<unknown>>(newsPaths, { limit }, { name: 'news' });
    return normalizeNewsResponse(response);
  },

  async getETFFlows(): Promise<SosoResponse<unknown>> {
    return getWithFallback<SosoResponse<unknown>>(etfListPaths, undefined, {
      name: 'ETF flows',
      allowUnavailable: true,
      unavailableMessage: 'ETF list endpoint is unavailable.',
      defaultData: []
    });
  },

  async getETFSummaryHistory(days = 7): Promise<SosoResponse<Record<string, unknown>>> {
    const response = await getWithFallback<SosoResponse<unknown>>(etfSummaryPaths, { days }, {
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

  async getMacroEvents(date?: string): Promise<SosoResponse<MacroEvent[]>> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return get<SosoResponse<MacroEvent[]>>('/macro/events', { date: targetDate });
  },

  async getMacroEventHistory(eventName: string): Promise<SosoResponse<unknown[]>> {
    return get<SosoResponse<unknown[]>>(`/macro/events/${encodeURIComponent(eventName)}/history`);
  },

  async getSSIList(): Promise<SosoResponse<unknown>> {
    return getWithFallback<SosoResponse<unknown>>(ssiPaths, undefined, {
      name: 'SoSoValue index list',
      allowUnavailable: true,
      unavailableMessage: 'SoSoValue index endpoint is unavailable.',
      defaultData: []
    });
  },

  async getFundraising(): Promise<SosoResponse<unknown>> {
    return getWithFallback<SosoResponse<unknown>>(fundraisingPaths, undefined, {
      name: 'fundraising list',
      allowUnavailable: true,
      unavailableMessage: 'Fundraising endpoint is unavailable.',
      defaultData: []
    });
  },

  async getCoinMarketData(currencyIdentifier: CurrencyIdentifier): Promise<SosoResponse<unknown>> {
    const params = resolveCurrencyParams(currencyIdentifier);
    return getWithFallback<SosoResponse<unknown>>(coinMarketPaths, params, {
      name: 'coin market data'
    });
  },

  async getSectorSpotlight(): Promise<SosoResponse<Record<string, unknown>>> {
    return getWithFallback<SosoResponse<Record<string, unknown>>>(
      ['/currencies/sector-spotlight'],
      undefined,
      {
        name: 'sector spotlight',
        allowUnavailable: true,
        unavailableMessage: 'Sector spotlight endpoint is unavailable.',
        defaultData: { sector: [], spotlight: [] }
      }
    );
  },

  async getMarketSnapshot(currencyId: string): Promise<SosoResponse<unknown>> {
    if (!currencyId) {
      throw new Error('currencyId is required for getMarketSnapshot().');
    }

    return get<SosoResponse<unknown>>(`/currencies/${encodeURIComponent(currencyId)}/market-snapshot`);
  },

  async getHotNews(): Promise<SosoResponse<unknown>> {
    return getWithFallback<SosoResponse<unknown>>(['/feeds/hot-news', '/news/hot'], undefined, {
      name: 'hot news',
      allowUnavailable: true,
      unavailableMessage: 'Hot news endpoint is unavailable.',
      defaultData: []
    });
  },

  async getEventHistory(eventName: string): Promise<SosoResponse<unknown[]>> {
    if (!eventName) {
      throw new Error('eventName is required for getEventHistory().');
    }

    return get<SosoResponse<unknown[]>>(`/macro/events/${encodeURIComponent(eventName)}/history`);
  }
};

export = sosovalue;
