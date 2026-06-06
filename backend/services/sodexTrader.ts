import axios from 'axios';
import fs = require('fs');
import path = require('path');
import sodexSigner = require('./sodexSigner');

const PERPS_BASE = process.env.SODEX_TESTNET_PERPS || 'https://testnet-gw.sodex.dev/api/v1/perps';
const KEY_FILE = path.join(__dirname, '../../.sodex_key');

const client = axios.create({
  timeout: 10000,
  headers: {
    Accept: 'application/json'
  }
});

type SignedActionType = 'newOrder' | 'updateLeverage';

type TradingContext = {
  accountID: number;
  symbolID: number;
  apiKeyName?: string;
  marginMode: number;
  accountAddress: string;
};

type TimeInForceValue = 'GTC' | 'FOK' | 'IOC' | 'GTX';

type PerpsStateResponse = {
  data?: {
    aid?: number | string;
    S?: Array<{ s?: string; m?: number }>;
    P?: Array<{ s?: string; m?: number }>;
  };
};

type PerpsSymbolResponse = {
  data?: Array<{
    id?: number | string;
    name?: string;
    tickSize?: string;
    pricePrecision?: number;
    buyLimitUpRatio?: string;
    sellLimitDownRatio?: string;
  }>;
};

type PerpsApiKeysResponse = {
  data?: Array<{ name?: string; publicKey?: string }>;
};

type PerpsApiKey = NonNullable<PerpsApiKeysResponse['data']>[number];

type PerpsTickerResponse = {
  data?: Array<{
    symbol?: string;
    lastPx?: string;
    askPx?: string;
    bidPx?: string;
    indexPrice?: string;
    markPrice?: string;
  }>;
};

type PerpsRestResponse<T = unknown> = {
  code?: number;
  timestamp?: number;
  error?: string;
  data?: T;
};

type SignedOrderPayload = {
  clOrdID: string;
  modifier: number;
  side: number;
  type: number;
  timeInForce: number;
  price?: string;
  quantity?: string;
  funds?: string;
  stopPrice?: string;
  stopType?: number;
  triggerType?: number;
  reduceOnly: boolean;
  positionSide: number;
};

type NewOrderRequest = {
  accountID: number;
  symbolID: number;
  orders: SignedOrderPayload[];
};

type UpdateLeverageRequest = {
  accountID: number;
  symbolID: number;
  leverage: number;
  marginMode: number;
};

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function parseRequiredNumber(value: number | string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid SoDEX ${label}.`);
  }
  return parsed;
}

function parsePositiveNumber(value: number | string | undefined | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function trimToNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function countFractionDigits(value: string): number {
  const trimmed = value.trim();
  if (!trimmed.includes('.')) return 0;
  return trimmed.split('.')[1]?.length || 0;
}

function formatStepValue(value: number, step: string, mode: 'up' | 'down'): string {
  const numericStep = parseRequiredNumber(step, 'tick size');
  const decimals = countFractionDigits(step);
  const scaled = value / numericStep;
  const roundedUnits = mode === 'up' ? Math.ceil(scaled - 1e-9) : Math.floor(scaled + 1e-9);
  const roundedValue = roundedUnits * numericStep;
  return roundedValue.toFixed(decimals);
}

function timeInForceCode(value: TimeInForceValue | undefined, orderType: 'MARKET' | 'LIMIT'): number {
  const normalized = value || (orderType === 'MARKET' ? 'IOC' : 'GTC');

  switch (normalized) {
    case 'GTC':
      return 1;
    case 'FOK':
      return 2;
    case 'IOC':
      return 3;
    case 'GTX':
      return 4;
    default:
      return orderType === 'MARKET' ? 3 : 1;
  }
}

function createClientOrderId(symbol: string): string {
  const compactSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10) || 'order';
  return `sentinel-${compactSymbol}-${Date.now()}`.slice(0, 36);
}

function extractErrorMessage(error: any): string {
  const responseData = error?.response?.data;

  if (typeof responseData?.error === 'string' && responseData.error.trim()) {
    return responseData.error.trim();
  }

  if (typeof responseData?.message === 'string' && responseData.message.trim()) {
    return responseData.message.trim();
  }

  if (Array.isArray(responseData?.data) && responseData.data.length > 0) {
    const itemError = responseData.data.find((item: Record<string, unknown>) => typeof item?.error === 'string');
    if (typeof itemError?.error === 'string' && itemError.error.trim()) {
      return itemError.error.trim();
    }
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return 'Unexpected SoDEX API error.';
}

type SodexWallet = ReturnType<typeof sodexSigner.createWallet>;

function configuredAccountAddress(fallbackAddress: string): string {
  return (
    trimToNull(process.env.SODEX_ACCOUNT_ADDRESS) ||
    trimToNull(process.env.SODEX_WALLET_ADDRESS) ||
    fallbackAddress
  );
}

function configuredApiKeyName(): string | null {
  const configured = trimToNull(process.env.SODEX_API_KEY_NAME) || trimToNull(process.env.SODEX_KEY_NAME);
  return configured && configured.toLowerCase() !== 'default' ? configured : null;
}

async function fetchAccountApiKeys(accountAddress: string): Promise<PerpsApiKey[]> {
  const apiKeyResponse = await client.get<PerpsRestResponse<PerpsApiKeysResponse['data']>>(
    `${PERPS_BASE}/accounts/${accountAddress}/api-keys`
  );

  return apiKeyResponse.data?.data || [];
}

function resolveApiKeyNameFromList(
  apiKeys: PerpsApiKey[],
  signerAddress: string,
  configuredName: string | null
): string | undefined {
  const matchingSignerKey = apiKeys.find((entry) =>
    normalizeAddress(entry?.publicKey || '') === normalizeAddress(signerAddress)
  );

  if (configuredName) {
    const configuredKey = apiKeys.find((entry) => entry?.name === configuredName);

    if (
      configuredKey &&
      configuredKey.name?.toLowerCase() !== 'default' &&
      (!configuredKey.publicKey || configuredKey === matchingSignerKey)
    ) {
      return configuredName;
    }

    if (matchingSignerKey?.name && matchingSignerKey.name.toLowerCase() !== 'default') {
      console.warn(
        `[SoDEX Trader] Configured API key "${configuredName}" was not registered for signer ${signerAddress}. ` +
          `Using registered key "${matchingSignerKey.name}" instead.`
      );
      return matchingSignerKey.name;
    }

    return configuredName;
  }

  return matchingSignerKey?.name?.toLowerCase() === 'default' ? undefined : matchingSignerKey?.name;
}

async function resolveTradingContext(wallet: SodexWallet, symbol: string): Promise<TradingContext> {
  const accountAddress = configuredAccountAddress(wallet.address);
  const envAccountID = trimToNull(process.env.SODEX_ACCOUNT_ID);
  const envApiKeyName = configuredApiKeyName();

  const [stateResponse, symbolResponse] = await Promise.all([
    client.get<PerpsRestResponse<PerpsStateResponse['data']>>(`${PERPS_BASE}/accounts/${accountAddress}/state`),
    client.get<PerpsRestResponse<PerpsSymbolResponse['data']>>(`${PERPS_BASE}/markets/symbols`, {
      params: { symbol }
    })
  ]);

  const state = stateResponse.data?.data;
  const symbols = symbolResponse.data?.data || [];
  const signerMatchesAccount = normalizeAddress(wallet.address) === normalizeAddress(accountAddress);

  const accountID = parseRequiredNumber(envAccountID || state?.aid, 'account ID');
  const symbolRecord = symbols.find((entry) => entry?.name === symbol);

  if (!symbolRecord?.id) {
    throw new Error(`Could not resolve SoDEX symbol ID for ${symbol}.`);
  }

  let apiKeyName = envApiKeyName || undefined;

  if (apiKeyName || !signerMatchesAccount) {
    try {
      const apiKeys = await fetchAccountApiKeys(accountAddress);
      apiKeyName = resolveApiKeyNameFromList(apiKeys, wallet.address, envApiKeyName);
    } catch (error: any) {
      if (!apiKeyName) {
        throw error;
      }

      console.warn(
        `[SoDEX Trader] Could not verify configured API key "${apiKeyName}"; using it anyway: ${extractErrorMessage(error)}`
      );
    }
  }

  if (!apiKeyName && !signerMatchesAccount) {
    throw new Error('No SoDEX API key is registered for this wallet.');
  }

  const symbolConfig =
    state?.S?.find((entry) => entry?.s === symbol) || state?.P?.find((entry) => entry?.s === symbol);

  return {
    accountID,
    symbolID: parseRequiredNumber(symbolRecord.id, 'symbol ID'),
    apiKeyName,
    marginMode: typeof symbolConfig?.m === 'number' ? symbolConfig.m : 2,
    accountAddress
  };
}

async function fetchClosePricing(symbol: string): Promise<{
  tickSize: string;
  markPrice: number;
  bidPrice: number | null;
  askPrice: number | null;
  buyLimitUpRatio: number;
  sellLimitDownRatio: number;
}> {
  const [symbolResponse, tickerResponse] = await Promise.all([
    client.get<PerpsRestResponse<PerpsSymbolResponse['data']>>(`${PERPS_BASE}/markets/symbols`, {
      params: { symbol }
    }),
    client.get<PerpsRestResponse<PerpsTickerResponse['data']>>(`${PERPS_BASE}/markets/tickers`, {
      params: { symbol }
    })
  ]);

  const symbolRecord = (symbolResponse.data?.data || []).find((entry) => entry?.name === symbol);
  const tickerRecord = (tickerResponse.data?.data || []).find((entry) => entry?.symbol === symbol);

  if (!symbolRecord?.tickSize) {
    throw new Error(`Could not resolve SoDEX tick size for ${symbol}.`);
  }

  const markPrice =
    parsePositiveNumber(tickerRecord?.markPrice) ||
    parsePositiveNumber(tickerRecord?.indexPrice) ||
    parsePositiveNumber(tickerRecord?.lastPx);

  if (!markPrice) {
    throw new Error(`Could not resolve SoDEX reference price for ${symbol}.`);
  }

  return {
    tickSize: symbolRecord.tickSize,
    markPrice,
    bidPrice: parsePositiveNumber(tickerRecord?.bidPx),
    askPrice: parsePositiveNumber(tickerRecord?.askPx),
    buyLimitUpRatio: parsePositiveNumber(symbolRecord.buyLimitUpRatio) || 0.05,
    sellLimitDownRatio: parsePositiveNumber(symbolRecord.sellLimitDownRatio) || 0.05
  };
}

async function buildCloseLimitPrice(symbol: string, side: 'BUY' | 'SELL'): Promise<string> {
  const pricing = await fetchClosePricing(symbol);
  const referenceBid = pricing.bidPrice || pricing.markPrice;
  const referenceAsk = pricing.askPrice || pricing.markPrice;

  if (side === 'BUY') {
    const cap = pricing.markPrice * (1 + pricing.buyLimitUpRatio);
    const target = Math.max(referenceAsk, pricing.markPrice) * 1.01;
    const bounded = Math.max(referenceAsk, Math.min(cap, target));
    return formatStepValue(bounded, pricing.tickSize, 'up');
  }

  const floor = pricing.markPrice * (1 - pricing.sellLimitDownRatio);
  const target = Math.min(referenceBid, pricing.markPrice) * 0.99;
  const bounded = Math.min(referenceBid, Math.max(floor, target));
  return formatStepValue(bounded, pricing.tickSize, 'down');
}

async function postSigned<T>(
  wallet: SodexWallet,
  context: TradingContext,
  actionType: SignedActionType,
  endpoint: string,
  body: NewOrderRequest | UpdateLeverageRequest
): Promise<PerpsRestResponse<T>> {
  const signed = await sodexSigner.signSodexAction({
    privateKey: wallet.privateKey,
    marketType: 'perps',
    actionType,
    params: body,
    baseUrl: PERPS_BASE
  });
  const signedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-API-Sign': signed.typedSignature,
    'X-API-Nonce': signed.nonce
  };

  if (context.apiKeyName) {
    signedHeaders['X-API-Key'] = context.apiKeyName;
  }

  const response = await client.post<PerpsRestResponse<T>>(`${PERPS_BASE}${endpoint}`, body, {
    headers: signedHeaders
  });

  return response.data;
}

function buildOrderPayload(params: PlaceOrderParams): SignedOrderPayload {
  const payload: SignedOrderPayload = {
    clOrdID: createClientOrderId(params.symbol),
    modifier: 1,
    side: params.side === 'BUY' ? 1 : 2,
    type: params.type === 'MARKET' ? 2 : 1,
    timeInForce: timeInForceCode(params.timeInForce, params.type),
    reduceOnly: Boolean(params.reduceOnly),
    positionSide: 1
  };

  const price = trimToNull(params.price);
  const quantity = trimToNull(params.quantity);

  if (price) {
    payload.price = price;
  }

  if (quantity) {
    payload.quantity = quantity;
  }

  return payload;
}

async function submitLeverageUpdate(
  wallet: SodexWallet,
  context: TradingContext,
  symbol: string,
  newLeverage: number
): Promise<OrderResult> {
  const body: UpdateLeverageRequest = {
    accountID: context.accountID,
    symbolID: context.symbolID,
    leverage: newLeverage,
    marginMode: context.marginMode
  };

  try {
    const response = await postSigned(wallet, context, 'updateLeverage', '/trade/leverage', body);

    if (response.code === 0) {
      return {
        success: true,
        message: `Leverage changed to ${newLeverage}x for ${symbol}`,
        raw: response
      };
    }

    return {
      success: false,
      message: response.error || `SoDEX rejected the leverage update for ${symbol}.`,
      raw: response
    };
  } catch (error: any) {
    return {
      success: false,
      message: extractErrorMessage(error),
      raw: error?.response?.data
    };
  }
}

export function saveKey(privateKey: string): void {
  const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  sodexSigner.createWallet(normalized);
  fs.writeFileSync(KEY_FILE, normalized, { mode: 0o600 });
}

export function loadKey(): string | null {
  try {
    if (process.env.SODEX_API_PRIVATE_KEY) return process.env.SODEX_API_PRIVATE_KEY;
    if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
    return process.env.SODEX_PRIVATE_KEY || null;
  } catch {
    return null;
  }
}

export function removeKey(): void {
  try {
    if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE);
  } catch {}
}

export function hasKey(): boolean {
  return loadKey() !== null;
}

export function getWalletAddress(): string | null {
  const key = loadKey();
  if (!key) return null;

  try {
    return sodexSigner.createWallet(key).address;
  } catch {
    return null;
  }
}

export function getAccountAddress(): string | null {
  const signerAddress = getWalletAddress();
  if (!signerAddress) return trimToNull(process.env.SODEX_ACCOUNT_ADDRESS);
  return configuredAccountAddress(signerAddress);
}

export interface PlaceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  timeInForce?: TimeInForceValue;
  leverage?: number;
  reduceOnly?: boolean;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  message: string;
  raw?: unknown;
}

export async function closePosition(symbol: string, sizeHint = ''): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key set. Use SODEX_API_PRIVATE_KEY or /setkey to add one.' };

  const wallet = sodexSigner.createWallet(key);
  let side: 'BUY' | 'SELL' = 'SELL';
  let quantity = trimToNull(sizeHint);

  try {
    const sodex = require('./sodex');
    const enriched = await sodex.getEnrichedPositions(configuredAccountAddress(wallet.address));
    const position = (enriched.positions || []).find((entry: any) => entry.symbol === symbol);

    if (position && Number(position.positionSize) !== 0) {
      quantity = String(Math.abs(Number(position.positionSize)));
      side = position.side === 'SHORT' || Number(position.positionSize) < 0 ? 'BUY' : 'SELL';
    }
  } catch {}

  if (!quantity || Number(quantity) === 0) {
    return {
      success: false,
      message: `No open position found for ${symbol} on SoDEX.`
    };
  }

  let price: string;

  try {
    price = await buildCloseLimitPrice(symbol, side);
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || `Could not price close order for ${symbol}.`
    };
  }

  return placeOrder({
    symbol,
    side,
    type: 'LIMIT',
    price,
    timeInForce: 'IOC',
    quantity,
    reduceOnly: true
  });
}

export async function placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key set. Use SODEX_API_PRIVATE_KEY or /setkey to add one.' };

  const wallet = sodexSigner.createWallet(key);

  try {
    const context = await resolveTradingContext(wallet, params.symbol);

    if (typeof params.leverage === 'number' && Number.isFinite(params.leverage)) {
      const leverageResult = await submitLeverageUpdate(wallet, context, params.symbol, params.leverage);
      if (!leverageResult.success) {
        return leverageResult;
      }
    }

    const body: NewOrderRequest = {
      accountID: context.accountID,
      symbolID: context.symbolID,
      orders: [buildOrderPayload(params)]
    };

    const response = await postSigned<
      Array<{ code?: number; orderID?: number | string; error?: string; clOrdID?: string }>
    >(
      wallet,
      context,
      'newOrder',
      '/trade/orders',
      body
    );

    if (response.code === 0) {
      const firstOrder = Array.isArray(response.data) ? response.data[0] : undefined;
      if (firstOrder && typeof firstOrder.code === 'number' && firstOrder.code !== 0) {
        return {
          success: false,
          message: firstOrder.error || `SoDEX rejected the order for ${params.symbol}.`,
          raw: response
        };
      }

      return {
        success: true,
        orderId: firstOrder?.orderID ? String(firstOrder.orderID) : undefined,
        message:
          params.reduceOnly && params.timeInForce === 'IOC'
            ? `Close order submitted: ${params.side} ${params.quantity} ${params.symbol} @ ${params.price}`
            : `Order placed: ${params.side} ${params.quantity} ${params.symbol}`,
        raw: response
      };
    }

    return {
      success: false,
      message: response.error || `SoDEX rejected the order for ${params.symbol}.`,
      raw: response
    };
  } catch (error: any) {
    return {
      success: false,
      message: extractErrorMessage(error),
      raw: error?.response?.data
    };
  }
}

export async function reduceLeverage(symbol: string, newLeverage: number): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key set. Use SODEX_API_PRIVATE_KEY or /setkey to add one.' };

  const wallet = sodexSigner.createWallet(key);

  try {
    const context = await resolveTradingContext(wallet, symbol);
    return submitLeverageUpdate(wallet, context, symbol, newLeverage);
  } catch (error: any) {
    return {
      success: false,
      message: extractErrorMessage(error),
      raw: error?.response?.data
    };
  }
}

export const sodexTrader = {
  saveKey,
  loadKey,
  removeKey,
  hasKey,
  getWalletAddress,
  getAccountAddress,
  placeOrder,
  closePosition,
  reduceLeverage
};

export default sodexTrader;
