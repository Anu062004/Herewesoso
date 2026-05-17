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

const NEWS_ARRAY_KEYS = ['list', 'items', 'articles', 'records', 'news', 'data', 'results', 'feeds'];
const MACRO_ARRAY_KEYS = ['list', 'items', 'events', 'records', 'data', 'results'];

function extractNewsArray(obj: Record<string, unknown>): unknown[] | null {
  for (const key of NEWS_ARRAY_KEYS) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return null;
}

function extractMacroArray(input: unknown): unknown[] {
  if (Array.isArray(input)) {
    return input;
  }

  if (input && typeof input === 'object') {
    for (const key of MACRO_ARRAY_KEYS) {
      if (Array.isArray((input as Record<string, unknown>)[key])) {
        return (input as Record<string, unknown>)[key] as unknown[];
      }
    }
  }

  return [];
}

function toIsoOrNull(input: string | null): string | null {
  if (!input) return null;
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeFlatMacroEvent(item: Record<string, unknown>, fallbackDate?: string): MacroEvent | null {
  const name =
    typeof item.name === 'string' ? item.name :
    typeof item.event === 'string' ? item.event :
    typeof item.title === 'string' ? item.title :
    typeof item.indicator === 'string' ? item.indicator :
    null;

  if (!name) {
    return null;
  }

  const date =
    typeof item.date === 'string' ? item.date :
    typeof item.releaseDate === 'string' ? item.releaseDate.split('T')[0] :
    typeof item.day === 'string' ? item.day :
    fallbackDate || undefined;

  const time =
    typeof item.time === 'string' ? item.time :
    typeof item.releaseTime === 'string' ? item.releaseTime :
    undefined;

  const eventTime =
    typeof item.eventTime === 'string' ? item.eventTime :
    typeof item.releaseDate === 'string' ? item.releaseDate :
    typeof item.datetime === 'string' ? item.datetime :
    date ? toIsoOrNull([date, time].filter(Boolean).join(' ')) || undefined : undefined;

  return {
    ...item,
    id:
      typeof item.id === 'string'
        ? item.id
        : `${date || 'unknown'}:${name}:${time || 'unknown'}`,
    name,
    date,
    time,
    eventTime,
    importance:
      typeof item.importance === 'string' ? item.importance :
      typeof item.impact === 'string' ? item.impact :
      typeof item.level === 'string' ? item.level :
      undefined,
    country: typeof item.country === 'string' ? item.country : undefined,
    actual: typeof item.actual === 'string' ? item.actual : undefined,
    forecast: typeof item.forecast === 'string' ? item.forecast : undefined,
    previous: typeof item.previous === 'string' ? item.previous : undefined
  };
}

function normalizeMacroResponse(
  response: SosoResponse<unknown>,
  requestedDate?: string
): SosoResponse<MacroEvent[]> {
  const source = extractMacroArray(response?.data);
  const events: MacroEvent[] = [];

  for (const entry of source) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const row = entry as Record<string, unknown>;
    const rowDate =
      typeof row.date === 'string' ? row.date :
      typeof row.releaseDate === 'string' ? row.releaseDate.split('T')[0] :
      undefined;

    if (Array.isArray(row.events)) {
      for (const rawName of row.events) {
        if (typeof rawName !== 'string' || !rawName.trim()) {
          continue;
        }

        events.push({
          id: `${rowDate || requestedDate || 'unknown'}:${rawName}`,
          name: rawName.trim(),
          date: rowDate || requestedDate,
          time: typeof row.time === 'string' ? row.time : undefined,
          eventTime:
            toIsoOrNull(
              [rowDate || requestedDate, typeof row.time === 'string' ? row.time : null]
                .filter(Boolean)
                .join(' ')
            ) || undefined,
          importance:
            typeof row.importance === 'string' ? row.importance :
            typeof row.impact === 'string' ? row.impact :
            typeof row.level === 'string' ? row.level :
            undefined,
          country: typeof row.country === 'string' ? row.country : undefined
        });
      }

      continue;
    }

    const normalized = normalizeFlatMacroEvent(row, requestedDate);
    if (normalized) {
      events.push(normalized);
    }
  }

  const filtered = requestedDate
    ? events.filter((event) => !event.date || event.date === requestedDate)
    : events;

  const deduped = Array.from(
    new Map(
      filtered.map((event) => [
        `${event.date || ''}|${event.time || ''}|${event.name || ''}`,
        event
      ])
    ).values()
  );

  deduped.sort((left, right) => {
    const leftTime = new Date(left.eventTime || left.releaseDate || [left.date, left.time].filter(Boolean).join(' ')).getTime();
    const rightTime = new Date(right.eventTime || right.releaseDate || [right.date, right.time].filter(Boolean).join(' ')).getTime();
    return leftTime - rightTime;
  });

  return {
    ...response,
    data: deduped
  };
}

function normalizeNewsResponse(response: SosoResponse<unknown>): SosoResponse<unknown[]> {
  const responseData = response?.data;

  if (Array.isArray(responseData)) {
    return { ...response, data: responseData };
  }

  if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
    const arr = extractNewsArray(responseData as Record<string, unknown>);
    if (arr) {
      const rd = responseData as Record<string, unknown>;
      return {
        ...response,
        data: arr,
        meta: {
          page: rd.page ?? null,
          pageSize: rd.page_size ?? null,
          total: rd.total ?? null
        }
      };
    }
  }

  console.warn('[SoSoValue] Unrecognized news response structure:', JSON.stringify(response).slice(0, 300));
  return { ...response, data: [] };
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

const newsPaths = [process.env.SOSOVALUE_NEWS_PATH, '/news', '/feeds', '/news/list', '/feeds/news'];
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
    const response = await getWithFallback<SosoResponse<unknown>>(
      newsPaths,
      { limit, page_size: limit, count: limit },
      { name: 'news', allowUnavailable: true, unavailableMessage: 'News endpoint is unavailable.', defaultData: [] }
    );
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
    const response = await get<SosoResponse<unknown>>('/macro/events', { date: targetDate });
    return normalizeMacroResponse(response, date ? targetDate : undefined);
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
