import crypto from 'crypto';

import type { WalletNetwork } from './walletAuth';

import sodex = require('./sodex');
import supabaseService = require('./supabase');
import riskCalculator = require('../utils/riskCalculator');
import { isProduction } from '../config/env';

export type SupportedExchange = 'binance' | 'bybit' | 'okx';

export interface ExchangeConnectionView {
  id: string;
  exchange: SupportedExchange | 'sodex';
  label: string;
  status: 'ACTIVE' | 'ERROR' | 'DISABLED';
  credentialFingerprint: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface NormalizedExchangePosition {
  connectionId: string;
  exchange: SupportedExchange | 'sodex';
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  leverage: number;
  marginMode: string;
  unrealizedPnl: number;
  accountValue: number;
  availableMargin: number;
  initialMargin: number;
}

interface ConnectionRow {
  id: string;
  wallet_address: string;
  exchange: SupportedExchange;
  label: string;
  encrypted_credentials: string;
  credential_fingerprint: string;
  status: 'ACTIVE' | 'ERROR' | 'DISABLED';
  last_checked_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

interface Credentials {
  apiKey: string;
  secret: string;
  passphrase?: string;
}

const memoryConnections: ConnectionRow[] = [];
const { isSupabaseConfigured, strictInsert, strictSelect, strictUpdate, supabase } = supabaseService;

function asNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function now(): string {
  return new Date().toISOString();
}

function owner(address: string): string {
  return address.toLowerCase();
}

function encryptionKey(): Buffer {
  const dedicatedSecret = String(process.env.EXCHANGE_CREDENTIALS_KEY || '');
  if (isProduction() && dedicatedSecret.length < 32) {
    throw new Error('EXCHANGE_CREDENTIALS_KEY must contain at least 32 characters before exchange credentials can be stored.');
  }
  const secret = dedicatedSecret || String(process.env.SODEX_SESSION_SECRET || '');
  if (secret.length < 32) {
    throw new Error('EXCHANGE_CREDENTIALS_KEY must contain at least 32 characters before exchange credentials can be stored.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptCredentials(credentials: Credentials): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptCredentials(payload: string): Credentials {
  const [version, ivValue, tagValue, ciphertextValue, extra] = payload.split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue || extra) throw new Error('Credential ciphertext is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
  const parsed = JSON.parse(plaintext) as Credentials;
  if (!parsed.apiKey || !parsed.secret) throw new Error('Credential ciphertext is incomplete.');
  return parsed;
}

function validateCredentials(exchange: SupportedExchange, input: Record<string, unknown>): Credentials {
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  const secret = typeof input.secret === 'string' ? input.secret.trim() : '';
  const passphrase = typeof input.passphrase === 'string' ? input.passphrase.trim() : undefined;
  if (apiKey.length < 8 || apiKey.length > 256 || secret.length < 8 || secret.length > 256) {
    throw new Error('A valid read-only API key and secret are required.');
  }
  if (exchange === 'okx' && (!passphrase || passphrase.length > 256)) {
    throw new Error('OKX connections also require the API-key passphrase.');
  }
  return { apiKey, secret, ...(passphrase ? { passphrase } : {}) };
}

function fingerprint(credentials: Credentials): string {
  return crypto.createHash('sha256').update(credentials.apiKey).digest('hex').slice(0, 12);
}

function toView(row: ConnectionRow): ExchangeConnectionView {
  return {
    id: row.id,
    exchange: row.exchange,
    label: row.label,
    status: row.status,
    credentialFingerprint: row.credential_fingerprint,
    lastCheckedAt: row.last_checked_at || null,
    lastError: row.last_error || null,
    createdAt: row.created_at
  };
}

async function privateFetch(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) throw new Error(`Exchange authentication failed with HTTP ${response.status}.`);
  return payload;
}

function marketSymbol(value: unknown): string {
  const symbol = String(value || '').toUpperCase().replace(/[-_/]/g, '');
  for (const quote of ['USDT', 'USDC', 'USD']) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) return `${symbol.slice(0, -quote.length)}-USD`;
  }
  return String(value || '').toUpperCase();
}

async function fetchBinancePositions(connectionId: string, credentials: Credentials): Promise<NormalizedExchangePosition[]> {
  const query = `timestamp=${Date.now()}&recvWindow=5000`;
  const signature = crypto.createHmac('sha256', credentials.secret).update(query).digest('hex');
  const payload = await privateFetch(`https://fapi.binance.com/fapi/v2/positionRisk?${query}&signature=${signature}`, {
    headers: { 'X-MBX-APIKEY': credentials.apiKey }
  });
  return (Array.isArray(payload) ? payload : []).filter((row) => asNumber(row.positionAmt) !== 0).map((row) => {
    const size = asNumber(row.positionAmt);
    const markPrice = asNumber(row.markPrice);
    const leverage = Math.max(1, asNumber(row.leverage));
    const initialMargin = Math.abs(size * markPrice) / leverage;
    return {
      connectionId, exchange: 'binance' as const, symbol: marketSymbol(row.symbol), side: size < 0 ? 'SHORT' as const : 'LONG' as const,
      size, entryPrice: asNumber(row.entryPrice), markPrice, liquidationPrice: asNumber(row.liquidationPrice), leverage,
      marginMode: String(row.marginType || 'cross').toUpperCase(), unrealizedPnl: asNumber(row.unRealizedProfit),
      accountValue: initialMargin + Math.max(0, asNumber(row.unRealizedProfit)), availableMargin: 0, initialMargin
    };
  });
}

async function fetchBybitPositions(connectionId: string, credentials: Credentials): Promise<NormalizedExchangePosition[]> {
  const timestamp = String(Date.now());
  const recvWindow = '5000';
  const query = 'category=linear&settleCoin=USDT';
  const signature = crypto.createHmac('sha256', credentials.secret)
    .update(`${timestamp}${credentials.apiKey}${recvWindow}${query}`).digest('hex');
  const payload = await privateFetch(`https://api.bybit.com/v5/position/list?${query}`, {
    headers: {
      'X-BAPI-API-KEY': credentials.apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow
    }
  });
  if (asNumber(payload?.retCode) !== 0) throw new Error('Bybit rejected the read-only credentials.');
  return (Array.isArray(payload?.result?.list) ? payload.result.list : []).filter((row: any) => asNumber(row.size) !== 0).map((row: any) => {
    const absoluteSize = Math.abs(asNumber(row.size));
    const side = String(row.side).toLowerCase() === 'sell' ? 'SHORT' as const : 'LONG' as const;
    const size = side === 'SHORT' ? -absoluteSize : absoluteSize;
    const markPrice = asNumber(row.markPrice);
    const leverage = Math.max(1, asNumber(row.leverage));
    const initialMargin = asNumber(row.positionIM) || Math.abs(size * markPrice) / leverage;
    return {
      connectionId, exchange: 'bybit' as const, symbol: marketSymbol(row.symbol), side, size,
      entryPrice: asNumber(row.avgPrice), markPrice, liquidationPrice: asNumber(row.liqPrice), leverage,
      marginMode: asNumber(row.tradeMode) === 0 ? 'CROSS' : 'ISOLATED', unrealizedPnl: asNumber(row.unrealisedPnl),
      accountValue: initialMargin + Math.max(0, asNumber(row.unrealisedPnl)), availableMargin: 0, initialMargin
    };
  });
}

async function fetchOkxPositions(connectionId: string, credentials: Credentials): Promise<NormalizedExchangePosition[]> {
  const path = '/api/v5/account/positions';
  const timestamp = new Date().toISOString();
  const signature = crypto.createHmac('sha256', credentials.secret)
    .update(`${timestamp}GET${path}`).digest('base64');
  const payload = await privateFetch(`https://www.okx.com${path}`, {
    headers: {
      'OK-ACCESS-KEY': credentials.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': credentials.passphrase || ''
    }
  });
  if (String(payload?.code || '0') !== '0') throw new Error('OKX rejected the read-only credentials.');
  return (Array.isArray(payload?.data) ? payload.data : []).filter((row: any) => asNumber(row.pos) !== 0).map((row: any) => {
    const absoluteSize = Math.abs(asNumber(row.pos));
    const side = String(row.posSide).toLowerCase() === 'short' || asNumber(row.pos) < 0 ? 'SHORT' as const : 'LONG' as const;
    const size = side === 'SHORT' ? -absoluteSize : absoluteSize;
    const markPrice = asNumber(row.markPx);
    const leverage = Math.max(1, asNumber(row.lever));
    const initialMargin = asNumber(row.imr) || Math.abs(size * markPrice) / leverage;
    return {
      connectionId, exchange: 'okx' as const, symbol: marketSymbol(row.instId), side, size,
      entryPrice: asNumber(row.avgPx), markPrice, liquidationPrice: asNumber(row.liqPx), leverage,
      marginMode: String(row.mgnMode || 'cross').toUpperCase(), unrealizedPnl: asNumber(row.upl),
      accountValue: asNumber(row.margin) || initialMargin + Math.max(0, asNumber(row.upl)), availableMargin: 0, initialMargin
    };
  });
}

async function fetchConnectionPositions(row: ConnectionRow): Promise<NormalizedExchangePosition[]> {
  const credentials = decryptCredentials(row.encrypted_credentials);
  if (row.exchange === 'binance') return fetchBinancePositions(row.id, credentials);
  if (row.exchange === 'bybit') return fetchBybitPositions(row.id, credentials);
  return fetchOkxPositions(row.id, credentials);
}

async function rowsForWallet(walletAddress: string): Promise<ConnectionRow[]> {
  if (isSupabaseConfigured) {
    return strictSelect<ConnectionRow>('exchange_connections', (query: any) =>
      query.eq('wallet_address', owner(walletAddress)).order('created_at', { ascending: false })
    );
  }
  return memoryConnections.filter((row) => row.wallet_address === owner(walletAddress));
}

export async function listConnections(walletAddress: string, includeSodex = true): Promise<ExchangeConnectionView[]> {
  const rows = await rowsForWallet(walletAddress);
  const result = rows.map(toView);
  if (includeSodex) result.unshift({
    id: 'sodex-wallet', exchange: 'sodex', label: 'Connected SIWE wallet', status: 'ACTIVE',
    credentialFingerprint: null, lastCheckedAt: null, lastError: null, createdAt: now()
  });
  return result;
}

export async function createConnection(input: {
  walletAddress: string;
  exchange: SupportedExchange;
  label: string;
  credentials: Record<string, unknown>;
}): Promise<ExchangeConnectionView> {
  if (isProduction() && process.env.ENABLE_CROSS_EXCHANGE_SHIELD !== 'true') {
    throw new Error('Cross-exchange Shield connections are disabled in this deployment.');
  }
  if (!['binance', 'bybit', 'okx'].includes(input.exchange)) throw new Error('Unsupported exchange.');
  const label = input.label.trim();
  if (!label || label.length > 64) throw new Error('Connection label must contain 1 to 64 characters.');
  const credentials = validateCredentials(input.exchange, input.credentials);
  const createdAt = now();
  const row: ConnectionRow = {
    id: crypto.randomUUID(), wallet_address: owner(input.walletAddress), exchange: input.exchange, label,
    encrypted_credentials: encryptCredentials(credentials), credential_fingerprint: fingerprint(credentials),
    status: 'ACTIVE', last_checked_at: null, last_error: null, created_at: createdAt, updated_at: createdAt
  };
  const existingRows = await rowsForWallet(input.walletAddress);
  if (existingRows.some((entry) => entry.exchange === input.exchange && entry.label.toLowerCase() === label.toLowerCase())) {
    throw new Error('A connection with that exchange and label already exists.');
  }
  // Validate read-only access before retaining credentials.
  await fetchConnectionPositions(row);
  row.last_checked_at = now();
  if (isSupabaseConfigured) {
    const inserted = await strictInsert('exchange_connections', row);
    return toView((inserted[0] as unknown as ConnectionRow | undefined) || row);
  }
  memoryConnections.unshift(row);
  return toView(row);
}

export async function deleteConnection(walletAddress: string, connectionId: string): Promise<boolean> {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('exchange_connections').delete()
      .eq('id', connectionId).eq('wallet_address', owner(walletAddress)).select('id');
    if (error) throw error;
    return Boolean(data?.length);
  }
  const index = memoryConnections.findIndex((row) => row.id === connectionId && row.wallet_address === owner(walletAddress));
  if (index < 0) return false;
  memoryConnections.splice(index, 1);
  return true;
}

async function updateConnection(row: ConnectionRow, values: Partial<ConnectionRow>) {
  Object.assign(row, values, { updated_at: now() });
  if (isSupabaseConfigured) await strictUpdate('exchange_connections', values, { id: row.id, wallet_address: row.wallet_address });
}

export async function scan(walletAddress: string, network: WalletNetwork) {
  const rows = (await rowsForWallet(walletAddress)).filter((row) => row.status !== 'DISABLED');
  const errors: Array<{ connectionId: string; exchange: string; error: string }> = [];
  const positionGroups = await Promise.all(rows.map(async (row) => {
    try {
      const positions = await fetchConnectionPositions(row);
      await updateConnection(row, { status: 'ACTIVE', last_checked_at: now(), last_error: null });
      return positions;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Exchange request failed.';
      errors.push({ connectionId: row.id, exchange: row.exchange, error: message });
      await updateConnection(row, { status: 'ERROR', last_checked_at: now(), last_error: message });
      return [];
    }
  }));

  let sodexPositions: NormalizedExchangePosition[] = [];
  try {
    const state = await sodex.getEnrichedPositions(walletAddress, network);
    const account = state.accountState;
    sodexPositions = state.positions.map((position) => {
      const size = asNumber(position.positionSize);
      return {
        connectionId: 'sodex-wallet', exchange: 'sodex', symbol: position.symbol,
        side: riskCalculator.resolveDirection(position.positionSide || position.side, size), size,
        entryPrice: asNumber(position.entryPrice), markPrice: asNumber(position.markPrice || position.entryPrice),
        liquidationPrice: asNumber(position.liquidationPrice), leverage: Math.max(1, asNumber(position.leverage)),
        marginMode: String(position.marginMode || 'CROSS'), unrealizedPnl: 0,
        accountValue: account?.accountValue || 0, availableMargin: account?.availableMargin || 0,
        initialMargin: account?.initialMargin || 0
      };
    });
  } catch (error) {
    errors.push({ connectionId: 'sodex-wallet', exchange: 'sodex', error: 'SoDEX account data is unavailable.' });
  }

  const positions = [...sodexPositions, ...positionGroups.flat()].map((position) => ({
    ...position,
    analysis: riskCalculator.analyzePosition({
      markPrice: position.markPrice,
      liquidationPrice: position.liquidationPrice,
      entryPrice: position.entryPrice,
      leverage: position.leverage,
      positionSize: position.size,
      positionSide: position.side,
      accountValue: position.accountValue,
      availableMargin: position.availableMargin,
      initialMargin: position.initialMargin,
      unrealizedPnl: position.unrealizedPnl
    })
  }));
  const grossNotional = positions.reduce((sum, position) => sum + position.analysis.notional, 0);
  const netExposure = positions.reduce((sum, position) => sum + position.markPrice * position.size, 0);
  const maxRiskScore = Math.max(0, ...positions.map((position) => position.analysis.score));
  const riskLevel = riskCalculator.scoreToRiskLevel(maxRiskScore);
  const exchangeCount = new Set(positions.map((position) => position.exchange)).size;
  const summary = {
    exchangeCount, positionCount: positions.length,
    grossNotional: Number(grossNotional.toFixed(2)), netExposure: Number(netExposure.toFixed(2)),
    maxRiskScore, riskLevel
  };
  const result = { walletAddress: owner(walletAddress), network, summary, positions, errors, scannedAt: now() };
  if (isSupabaseConfigured) {
    await strictInsert('cross_exchange_scans', {
      wallet_address: owner(walletAddress), exchange_count: exchangeCount, position_count: positions.length,
      gross_notional: summary.grossNotional, net_exposure: summary.netExposure,
      max_risk_score: maxRiskScore, risk_level: riskLevel, data: result
    });
  } else if (isProduction()) {
    throw new Error('Durable Shield scan persistence is unavailable.');
  }
  return result;
}

export const crossExchangeShield = {
  createConnection,
  decryptCredentials,
  deleteConnection,
  encryptCredentials,
  listConnections,
  scan
};

export default crossExchangeShield;
