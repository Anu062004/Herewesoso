import axios from 'axios';
import sodexSigner = require('./sodexSigner');
import keyProvider = require('./keyProvider');
import supabaseService = require('./supabase');
import { operatorWallets } from '../config/env';

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

export interface ExecutionReadiness {
  ready: boolean;
  message: string;
  network: SodexTradingNetwork;
  chainId: number;
  accountAddress: string | null;
  apiKeyName: string | null;
}

export function configuredTradingNetwork(): SodexTradingNetwork {
  return process.env.SODEX_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

export function getExecutionReadiness(network: SodexTradingNetwork): ExecutionReadiness {
  const failures: string[] = [];
  const executionMode = String(process.env.EXECUTION_MODE || 'dry_run').toLowerCase();
  const expectedMode = network === 'mainnet' ? 'mainnet_canary' : 'testnet';
  const expectedChainId = network === 'mainnet' ? 286623 : 138565;
  const configuredChainId = Number(process.env.SODEX_CHAIN_ID);
  const accountAddress = trimToNull(process.env.SODEX_ACCOUNT_ADDRESS);
  const apiKeyName = configuredApiKeyName();
  const operators = operatorWallets();
  const keyStatus = keyProvider.getKeyStatus();
  const privateKey = keyProvider.loadPrivateKey();

  if (executionMode !== expectedMode) failures.push(`${network} writes require EXECUTION_MODE=${expectedMode}.`);
  if (String(process.env.SODEX_NETWORK || 'testnet').toLowerCase() !== network) {
    failures.push(`SODEX_NETWORK must be ${network}.`);
  }
  if (configuredChainId !== expectedChainId) failures.push(`SODEX_CHAIN_ID must be ${expectedChainId} for ${network}.`);
  if (keyStatus.provider !== 'managed' || !keyStatus.configured) {
    failures.push('Live SoDEX writes require a deployment-managed API signing key.');
  }
  if (!supabaseService.isSupabaseConfigured) {
    failures.push('Live SoDEX writes require Supabase for durable audit and nonce allocation.');
  }
  if (!accountAddress || !/^0x[0-9a-fA-F]{40}$/.test(accountAddress) || /^0x0{40}$/i.test(accountAddress)) {
    failures.push('A valid non-zero SODEX_ACCOUNT_ADDRESS is required.');
  }
  if (operators.length === 0) failures.push('At least one explicit OPERATOR_WALLET_ADDRESSES identity is required.');
  if (accountAddress && operators.includes(normalizeAddress(accountAddress))) {
    failures.push('The operator identity must be distinct from the SoDEX master account wallet.');
  }
  if (!apiKeyName || apiKeyName.toLowerCase() === 'default' || apiKeyName.length > 36) {
    failures.push('A non-default registered SODEX_API_KEY_NAME of at most 36 characters is required.');
  }

  if (privateKey && accountAddress) {
    try {
      const signerAddress = sodexSigner.createWallet(privateKey).address;
      if (normalizeAddress(signerAddress) === normalizeAddress(accountAddress)) {
        failures.push('The managed signer must be a registered API key, not the SoDEX master account wallet.');
      }
    } catch {
      failures.push('The managed SoDEX API signing key is invalid.');
    }
  }

  return {
    ready: failures.length === 0,
    message: failures.length === 0 ? 'Managed registered-key execution is configured.' : failures.join(' '),
    network,
    chainId: expectedChainId,
    accountAddress,
    apiKeyName
  };
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
): string {
  const normalizedSigner = normalizeAddress(signerAddress);
  if (!configuredName || isDefaultApiKeyName(configuredName)) {
    throw new Error('A non-default SODEX_API_KEY_NAME is required for trading actions.');
  }

  const configuredKey = apiKeys.find((entry) => entry?.name === configuredName);
  if (!configuredKey) {
    throw new Error(`Configured API key "${configuredName}" is not registered on this SoDEX account. ${describeAvailableApiKeys(apiKeys)}`);
  }
  if (!configuredKey.publicKey) {
    throw new Error(`SoDEX did not return a public key for registered API key "${configuredName}"; refusing to sign without verification.`);
  }
  if (normalizeAddress(configuredKey.publicKey) !== normalizedSigner) {
    throw new Error(
      `Configured API key "${configuredName}" belongs to ${configuredKey.publicKey}, but the managed private key derives ${signerAddress}.`
    );
  }

  return configuredName;
}

async function resolveTradingContext(wallet: SodexWallet, symbol: string, baseUrl: string): Promise<TradingContext> {
  const accountAddress = trimToNull(process.env.SODEX_ACCOUNT_ADDRESS);
  if (!accountAddress) throw new Error('SODEX_ACCOUNT_ADDRESS is required for registered-key trading.');
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

  const discoveredAccountID = parseRequiredNumber(state?.aid, 'account ID');
  const accountID = envAccountID ? parseRequiredNumber(envAccountID, 'configured account ID') : discoveredAccountID;
  if (envAccountID && accountID !== discoveredAccountID) {
    throw new Error(`SODEX_ACCOUNT_ID=${accountID} does not match account ${accountAddress} (aid ${discoveredAccountID}).`);
  }
  const symbolRecord = symbols.find((entry) => entry?.name === symbol);

  if (!symbolRecord?.id) {
    throw new Error(`Could not resolve SoDEX symbol ID for ${symbol}.`);
  }

  if (signerMatchesAccount) {
    throw new Error('The managed signer is the SoDEX master wallet. Trading actions require a separate registered API key.');
  }
  const apiKeys = await fetchAccountApiKeys(accountAddress, baseUrl);
  const apiKeyName = resolveApiKeyNameFromList(apiKeys, wallet.address, envApiKeyName);

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
  if (!context.apiKeyName || isDefaultApiKeyName(context.apiKeyName)) {
    throw new Error('Refusing to submit a SoDEX trading action without a registered X-API-Key name.');
  }
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

  signedHeaders['X-API-Key'] = context.apiKeyName;

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

export function buildOrderPayload(params: PlaceOrderParams): SignedOrderPayload {
  const price = trimToNull(params.price);
  const quantity = trimToNull(params.quantity);
  const payload: SignedOrderPayload = {
    clOrdID: createClientOrderId(params.symbol),
    modifier: 1,
    side: params.side === 'BUY' ? 1 : 2,
    type: params.type === 'MARKET' ? 2 : 1,
    timeInForce: timeInForceCode(params.timeInForce, params.type),
    ...(price ? { price } : {}),
    ...(quantity ? { quantity } : {}),
    reduceOnly: Boolean(params.reduceOnly),
    positionSide: 1
  };

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

export async function verifyRegisteredTradingKey(
  symbol: string,
  network: SodexTradingNetwork = configuredTradingNetwork()
): Promise<Record<string, unknown>> {
  const readiness = getExecutionReadiness(network);
  if (!readiness.ready) throw new Error(readiness.message);
  const key = loadKey();
  if (!key) throw new Error('The deployment-managed SoDEX API signing key is unavailable.');
  const wallet = sodexSigner.createWallet(key);
  const context = await resolveTradingContext(wallet, symbol, perpsBase(network));
  return {
    ready: true,
    network,
    chainId: readiness.chainId,
    accountAddress: context.accountAddress,
    accountID: context.accountID,
    apiKeyName: context.apiKeyName,
    signerAddress: wallet.address,
    symbol,
    symbolID: context.symbolID
  };
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

export async function closePosition(symbol: string, _sizeHint = '', network: SodexTradingNetwork = configuredTradingNetwork()): Promise<OrderResult> {
  const readiness = getExecutionReadiness(network);
  if (!readiness.ready) return { success: false, message: readiness.message };
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key is provisioned by the server operator.' };

  const wallet = sodexSigner.createWallet(key);
  let side: 'BUY' | 'SELL' = 'SELL';
  let quantity: string | null = null;

  try {
    const sodex = require('./sodex');
    const enriched = await sodex.getEnrichedPositions(configuredAccountAddress(wallet.address), network);
    const position = (enriched.positions || []).find((entry: any) =>
      String(entry.symbol || '').toUpperCase() === symbol.toUpperCase()
    );

    if (position && Number(position.positionSize) !== 0) {
      quantity = String(Math.abs(Number(position.positionSize)));
      side = position.side === 'SHORT' || Number(position.positionSize) < 0 ? 'BUY' : 'SELL';
    }
  } catch (error: any) {
    return { success: false, message: error?.message || `Could not verify the live ${symbol} position.` };
  }

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

export async function placeOrder(params: PlaceOrderParams, network: SodexTradingNetwork = configuredTradingNetwork()): Promise<OrderResult> {
  const readiness = getExecutionReadiness(network);
  if (!readiness.ready) return { success: false, message: readiness.message };
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key is provisioned by the server operator.' };
  if (!params.reduceOnly) {
    return { success: false, message: 'Automated opening orders are disabled; only reduce-only position closes are supported.' };
  }

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

export async function cancelOrders(params: CancelOrdersParams, network: SodexTradingNetwork = configuredTradingNetwork()): Promise<OrderResult> {
  const readiness = getExecutionReadiness(network);
  if (!readiness.ready) return { success: false, message: readiness.message };
  const key = loadKey();
  if (!key) {
    return { success: false, message: 'No SoDEX API signing key is provisioned by the server operator.' };
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

export async function cancelOrder(params: CancelOrderParams, network: SodexTradingNetwork = configuredTradingNetwork()): Promise<OrderResult> {
  return cancelOrders({
    symbol: params.symbol,
    cancels: [{ orderId: params.orderId, clOrdId: params.clOrdId }]
  }, network);
}

export async function reduceLeverage(symbol: string, newLeverage: number, network: SodexTradingNetwork = configuredTradingNetwork()): Promise<OrderResult> {
  const readiness = getExecutionReadiness(network);
  if (!readiness.ready) return { success: false, message: readiness.message };
  const key = loadKey();
  if (!key) return { success: false, message: 'No SoDEX API signing key is provisioned by the server operator.' };

  const wallet = sodexSigner.createWallet(key);

  try {
    const baseUrl = perpsBase(network);
    const sodex = require('./sodex');
    const enriched = await sodex.getEnrichedPositions(configuredAccountAddress(wallet.address), network);
    const position = (enriched.positions || []).find((entry: any) =>
      String(entry.symbol || '').toUpperCase() === symbol.toUpperCase() && Number(entry.positionSize || 0) !== 0
    );
    const currentLeverage = Number(position?.leverage || 0);
    if (!position || !Number.isFinite(currentLeverage) || currentLeverage <= 0) {
      return { success: false, message: `Could not verify an open ${symbol} position and its current leverage.` };
    }
    if (!Number.isFinite(newLeverage) || newLeverage < 1 || newLeverage >= currentLeverage) {
      return { success: false, message: `New leverage must be at least 1x and below the current ${currentLeverage}x leverage.` };
    }
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
  configuredTradingNetwork,
  getExecutionReadiness,
  verifyRegisteredTradingKey,
  buildOrderPayload,
  placeOrder,
  cancelOrder,
  cancelOrders,
  closePosition,
  reduceLeverage
};

export default sodexTrader;
