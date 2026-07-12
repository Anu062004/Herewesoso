import axios from 'axios';
import sodexSigner = require('./sodexSigner');
import keyProvider = require('./keyProvider');

export type SodexTradingNetwork = 'testnet' | 'mainnet';

function perpsBase(network: SodexTradingNetwork = 'testnet'): string {
  return network === 'mainnet'
    ? process.env.SODEX_MAINNET_PERPS || 'https://mainnet-gw.sodex.dev/api/v1/perps'
    : process.env.SODEX_TESTNET_PERPS || 'https://testnet-gw.sodex.dev/api/v1/perps';
}

const client = axios.create({
  timeout: 10000,
  headers: {
    Accept: 'application/json'
  }
});

type SignedActionType = 'newOrder' | 'cancelOrder' | 'updateLeverage';

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

type CancelItemPayload = {
  symbolID: number;
  orderID?: number;
  clOrdID?: string;
};

type CancelOrderRequest = {
  accountID: number;
  cancels: CancelItemPayload[];
};

type SignedRequestBody = NewOrderRequest | UpdateLeverageRequest | CancelOrderRequest;

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
  return configured;
}

function describeApiKey(entry: PerpsApiKey): string {
  return entry?.name && entry?.publicKey ? `${entry.name} (${entry.publicKey})` : entry?.name || 'unnamed';
}

function describeAvailableApiKeys(apiKeys: PerpsApiKey[]): string {
  const nonDefault = apiKeys.filter((entry) => entry?.name && entry.name !== 'default');

  if (nonDefault.length === 0) {
    return 'No non-default trading API keys are registered on this account.';
  }

  return `Registered trading API keys: ${nonDefault.map(describeApiKey).join(', ')}.`;
}

function isDefaultApiKeyName(value: string | null): boolean {
  return !value || value.toLowerCase() === 'default';
}

async function fetchAccountApiKeys(accountAddress: string, baseUrl: string): Promise<PerpsApiKey[]> {
  const apiKeyResponse = await client.get<PerpsRestResponse<PerpsApiKeysResponse['data']>>(
    `${baseUrl}/accounts/${accountAddress}/api-keys`
  );

  return apiKeyResponse.data?.data || [];
}

function resolveApiKeyNameFromList(
  apiKeys: PerpsApiKey[],
  signerAddress: string,
  configuredName: string | null
): string | undefined {
  const normalizedSigner = normalizeAddress(signerAddress);
  const matchingSignerKey = apiKeys.find((entry) =>
    normalizeAddress(entry?.publicKey || '') === normalizedSigner
  );

  if (configuredName) {
    const configuredKey = apiKeys.find((entry) => entry?.name === configuredName);

    if (configuredKey && !configuredKey.publicKey) {
      return configuredName;
    }

    if (configuredKey && normalizeAddress(configuredKey.publicKey || '') === normalizedSigner) {
      if (configuredKey.name === 'default') {
        return undefined;
      }

      return configuredName;
    }

    if (matchingSignerKey?.name) {
      if (matchingSignerKey.name === 'default') {
        if (isDefaultApiKeyName(configuredName)) {
          return undefined;
        }

        throw new Error(
          `Configured API key "${configuredName}" does not match signer ${signerAddress}. ` +
            'The signer is the master/default wallet, so omit SODEX_API_KEY_NAME or set it to "default".'
        );
      }

      console.warn(
        `[SoDEX Trader] Configured API key "${configuredName}" was not registered for signer ${signerAddress}. ` +
          `Using registered key "${matchingSignerKey.name}" instead.`
      );
      return matchingSignerKey.name;
    }

    const configuredKeyText = configuredKey
      ? `Configured API key "${configuredName}" belongs to ${configuredKey.publicKey}, but the configured private key derives ${signerAddress}.`
      : `Configured API key "${configuredName}" is not registered on this SoDEX account.`;

    throw new Error(`${configuredKeyText} ${describeAvailableApiKeys(apiKeys)}`);
  }

  if (matchingSignerKey?.name) {
    if (matchingSignerKey.name === 'default') {
      return undefined;
    }

    return matchingSignerKey.name;
  }

  throw new Error(
    `No registered SoDEX API key matches the configured signer ${signerAddress}. ` +
      `${describeAvailableApiKeys(apiKeys)}`
  );
}

async function resolveTradingContext(wallet: SodexWallet, symbol: string, baseUrl: string): Promise<TradingContext> {
  const accountAddress = configuredAccountAddress(wallet.address);
  const envAccountID = trimToNull(process.env.SODEX_ACCOUNT_ID);
  const envApiKeyName = configuredApiKeyName();

  const [stateResponse, symbolResponse] = await Promise.all([
    client.get<PerpsRestResponse<PerpsStateResponse['data']>>(`${baseUrl}/accounts/${accountAddress}/state`),
    client.get<PerpsRestResponse<PerpsSymbolResponse['data']>>(`${baseUrl}/markets/symbols`, {
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

  let apiKeyName: string | undefined;

  if (signerMatchesAccount && isDefaultApiKeyName(envApiKeyName)) {
    apiKeyName = undefined;
  } else {
    try {
      const apiKeys = await fetchAccountApiKeys(accountAddress, baseUrl);
      apiKeyName = resolveApiKeyNameFromList(apiKeys, wallet.address, envApiKeyName);
    } catch (error: any) {
      if (envApiKeyName && !signerMatchesAccount && error?.response) {
        console.warn(
          `[SoDEX Trader] Could not verify configured API key "${envApiKeyName}"; using it anyway: ${extractErrorMessage(error)}`
        );
        apiKeyName = envApiKeyName;
      } else {
        throw error;
      }
    }
  }

  if (signerMatchesAccount && apiKeyName) {
    if (isDefaultApiKeyName(apiKeyName)) {
      apiKeyName = undefined;
    } else {
      throw new Error(
        `Configured API key "${apiKeyName}" cannot be used with the master wallet signer. ` +
          'Set SODEX_API_PRIVATE_KEY to the matching registered API key private key, or omit SODEX_API_KEY_NAME to sign as the master wallet.'
      );
    }
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

async function fetchClosePricing(symbol: string, baseUrl: string): Promise<{
  tickSize: string;
  markPrice: number;
  bidPrice: number | null;
  askPrice: number | null;
  buyLimitUpRatio: number;
  sellLimitDownRatio: number;
}> {
  const [symbolResponse, tickerResponse] = await Promise.all([
    client.get<PerpsRestResponse<PerpsSymbolResponse['data']>>(`${baseUrl}/markets/symbols`, {
      params: { symbol }
    }),
    client.get<PerpsRestResponse<PerpsTickerResponse['data']>>(`${baseUrl}/markets/tickers`, {
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

async function buildCloseLimitPrice(symbol: string, side: 'BUY' | 'SELL', baseUrl: string): Promise<string> {
  const pricing = await fetchClosePricing(symbol, baseUrl);
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
  body: SignedRequestBody,
  baseUrl: string,
  method: 'POST' | 'DELETE' = 'POST'
): Promise<PerpsRestResponse<T>> {
  const signed = await sodexSigner.signSodexAction({
    privateKey: wallet.privateKey,
    marketType: 'perps',
    actionType,
    params: body,
    baseUrl
  });
  const signedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-API-Sign': signed.typedSignature,
    'X-API-Nonce': signed.nonce,
    'X-API-Chain': String(signed.domain.chainId)
  };

  if (context.apiKeyName) {
    signedHeaders['X-API-Key'] = context.apiKeyName;
  }

  const requestBody = JSON.stringify(body);
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: signedHeaders,
    body: requestBody
  });

  const text = await response.text();
  const responseData = (text ? JSON.parse(text) : {}) as PerpsRestResponse<T>;
  (responseData as PerpsRestResponse<T> & { signed?: Record<string, unknown> }).signed = {
    payloadHash: signed.payloadHash,
    nonce: signed.nonce,
    chainId: signed.domain.chainId,
    signerAddress: wallet.address,
    actionType
  };

  if (!response.ok) {
    const error: any = new Error(responseData.error || response.statusText || 'SoDEX signed request failed.');
    error.response = {
      status: response.status,
      data: responseData
    };
    throw error;
  }

  return responseData;
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
  newLeverage: number,
  baseUrl: string
): Promise<OrderResult> {
  const body: UpdateLeverageRequest = {
    accountID: context.accountID,
    symbolID: context.symbolID,
    leverage: newLeverage,
    marginMode: context.marginMode
  };

  try {
    const response = await postSigned(wallet, context, 'updateLeverage', '/trade/leverage', body, baseUrl);

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
  keyProvider.saveRuntimePrivateKey(normalized);
}

export function loadKey(): string | null {
  return keyProvider.loadPrivateKey();
}

export function removeKey(): void {
  keyProvider.removeRuntimePrivateKey();
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

export interface CancelOrderItem {
  orderId?: string | number;
  clOrdId?: string;
}

export interface CancelOrderParams {
  symbol: string;
  orderId?: string | number;
  clOrdId?: string;
}

export interface CancelOrdersParams {
  symbol: string;
  cancels: CancelOrderItem[];
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  message: string;
  raw?: unknown;
}

export async function closePosition(symbol: string, sizeHint = '', network: SodexTradingNetwork = 'testnet'): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key set. Use SODEX_API_PRIVATE_KEY or /setkey to add one.' };

  const wallet = sodexSigner.createWallet(key);
  let side: 'BUY' | 'SELL' = 'SELL';
  let quantity = trimToNull(sizeHint);

  try {
    const sodex = require('./sodex');
    const enriched = await sodex.getEnrichedPositions(configuredAccountAddress(wallet.address), network);
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
    price = await buildCloseLimitPrice(symbol, side, perpsBase(network));
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
  }, network);
}

export async function placeOrder(params: PlaceOrderParams, network: SodexTradingNetwork = 'testnet'): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key set. Use SODEX_API_PRIVATE_KEY or /setkey to add one.' };

  const wallet = sodexSigner.createWallet(key);

  try {
    const baseUrl = perpsBase(network);
    const context = await resolveTradingContext(wallet, params.symbol, baseUrl);

    if (typeof params.leverage === 'number' && Number.isFinite(params.leverage)) {
      const leverageResult = await submitLeverageUpdate(wallet, context, params.symbol, params.leverage, baseUrl);
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
      body,
      baseUrl
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

function buildCancelItem(symbolID: number, item: CancelOrderItem): CancelItemPayload {
  const orderId =
    item.orderId !== undefined && item.orderId !== null && String(item.orderId).trim()
      ? String(item.orderId).trim()
      : '';
  const clOrdId = typeof item.clOrdId === 'string' ? item.clOrdId.trim() : '';

  if (Boolean(orderId) === Boolean(clOrdId)) {
    throw new Error('Provide either orderId or clOrdId for each cancel item, but not both.');
  }

  if (orderId) {
    return {
      symbolID,
      orderID: parseRequiredNumber(orderId, 'order ID')
    };
  }

  return {
    symbolID,
    clOrdID: clOrdId
  };
}

export async function cancelOrders(params: CancelOrdersParams, network: SodexTradingNetwork = 'testnet'): Promise<OrderResult> {
  const key = loadKey();
  if (!key) {
    return { success: false, message: 'No SoDEX API signing key set. Use SODEX_API_PRIVATE_KEY or /setkey to add one.' };
  }

  if (!Array.isArray(params.cancels) || params.cancels.length === 0) {
    return { success: false, message: 'At least one order must be provided to cancel.' };
  }

  if (params.cancels.length > 100) {
    return { success: false, message: 'SoDEX supports at most 100 cancels per request.' };
  }

  const wallet = sodexSigner.createWallet(key);

  try {
    const baseUrl = perpsBase(network);
    const context = await resolveTradingContext(wallet, params.symbol, baseUrl);
    const cancels = params.cancels.map((item) => buildCancelItem(context.symbolID, item));
    const body: CancelOrderRequest = {
      accountID: context.accountID,
      cancels
    };

    const response = await postSigned<
      Array<{ code?: number; orderID?: number | string; error?: string; clOrdID?: string }>
    >(wallet, context, 'cancelOrder', '/trade/orders', body, baseUrl, 'DELETE');

    if (response.code === 0) {
      const results = Array.isArray(response.data) ? response.data : [];
      const failures = results.filter((entry) => typeof entry.code === 'number' && entry.code !== 0);

      if (failures.length > 0) {
        const firstFailure = failures[0];
        return {
          success: false,
          message: firstFailure.error || `SoDEX rejected cancel for ${params.symbol}.`,
          raw: response
        };
      }

      const cancelledIds = results
        .map((entry) => (entry.orderID ? String(entry.orderID) : entry.clOrdID || null))
        .filter(Boolean);

      return {
        success: true,
        message:
          cancelledIds.length === 1
            ? `Cancelled order ${cancelledIds[0]} on ${params.symbol}`
            : `Cancelled ${cancelledIds.length} orders on ${params.symbol}`,
        raw: response
      };
    }

    return {
      success: false,
      message: response.error || `SoDEX rejected the cancel request for ${params.symbol}.`,
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

export async function cancelOrder(params: CancelOrderParams, network: SodexTradingNetwork = 'testnet'): Promise<OrderResult> {
  return cancelOrders({
    symbol: params.symbol,
    cancels: [{ orderId: params.orderId, clOrdId: params.clOrdId }]
  }, network);
}

export async function reduceLeverage(symbol: string, newLeverage: number, network: SodexTradingNetwork = 'testnet'): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key set. Use SODEX_API_PRIVATE_KEY or /setkey to add one.' };

  const wallet = sodexSigner.createWallet(key);

  try {
    const baseUrl = perpsBase(network);
    const context = await resolveTradingContext(wallet, symbol, baseUrl);
    return submitLeverageUpdate(wallet, context, symbol, newLeverage, baseUrl);
  } catch (error: any) {
    return {
      success: false,
      message: extractErrorMessage(error),
      raw: error?.response?.data
    };
  }
}

export function getKeyStatus() {
  return keyProvider.getKeyStatus();
}

export const sodexTrader = {
  saveKey,
  loadKey,
  removeKey,
  hasKey,
  getWalletAddress,
  getAccountAddress,
  getKeyStatus,
  placeOrder,
  cancelOrder,
  cancelOrders,
  closePosition,
  reduceLeverage
};

export default sodexTrader;
