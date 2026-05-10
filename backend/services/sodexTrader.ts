import { ethers } from 'ethers';
import axios from 'axios';
import fs = require('fs');
import path = require('path');

const PERPS_BASE = process.env.SODEX_TESTNET_PERPS || 'https://testnet-gw.sodex.dev/api/v1/perps';
const KEY_FILE = path.join(__dirname, '../../.sodex_key');

// ── Key management ────────────────────────────────────────────────────────────

export function saveKey(privateKey: string): void {
  const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  // Basic validation
  new ethers.Wallet(normalized); // throws if invalid
  fs.writeFileSync(KEY_FILE, normalized, { mode: 0o600 });
}

export function loadKey(): string | null {
  try {
    if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
    return process.env.SODEX_PRIVATE_KEY || null;
  } catch { return null; }
}

export function removeKey(): void {
  try { if (fs.existsSync(KEY_FILE)) fs.unlinkSync(KEY_FILE); } catch {}
}

export function hasKey(): boolean {
  return loadKey() !== null;
}

export function getWalletAddress(): string | null {
  const key = loadKey();
  if (!key) return null;
  try { return new ethers.Wallet(key).address; } catch { return null; }
}

// ── Order types ───────────────────────────────────────────────────────────────

export interface PlaceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  quantity: string;
  price?: string;
  leverage?: number;
  reduceOnly?: boolean;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  message: string;
  raw?: unknown;
}

// ── Signing helpers ───────────────────────────────────────────────────────────

async function signedHeaders(wallet: ethers.Wallet, body: string): Promise<Record<string, string>> {
  const timestamp = Date.now().toString();
  const message = `${timestamp}\n${body}`;
  const signature = await wallet.signMessage(message);
  return {
    'Content-Type': 'application/json',
    'X-Wallet-Address': wallet.address,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };
}

// ── Position close helpers ────────────────────────────────────────────────────

export async function closePosition(symbol: string, size: string): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No private key set. Use /setkey to add one.' };

  const wallet = new ethers.Wallet(key);
  const body = JSON.stringify({
    symbol,
    side: 'SELL',      // adjust: for short positions this would be BUY
    type: 'MARKET',
    quantity: size,
    reduceOnly: true,
  });

  try {
    const headers = await signedHeaders(wallet, body);
    const res = await axios.post(`${PERPS_BASE}/orders`, body, { headers, timeout: 10000 });
    return { success: true, orderId: res.data?.orderId, message: `Close order placed for ${symbol}`, raw: res.data };
  } catch (err: any) {
    const detail = err.response?.data?.message || err.message;
    return { success: false, message: detail, raw: err.response?.data };
  }
}

export async function placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No private key set. Use /setkey to add one.' };

  const wallet = new ethers.Wallet(key);
  const body = JSON.stringify({
    symbol: params.symbol,
    side: params.side,
    type: params.type,
    quantity: params.quantity,
    ...(params.price && { price: params.price }),
    ...(params.leverage && { leverage: params.leverage }),
    ...(params.reduceOnly && { reduceOnly: params.reduceOnly }),
  });

  try {
    const headers = await signedHeaders(wallet, body);
    const res = await axios.post(`${PERPS_BASE}/orders`, body, { headers, timeout: 10000 });
    return { success: true, orderId: res.data?.orderId, message: `Order placed: ${params.side} ${params.quantity} ${params.symbol}`, raw: res.data };
  } catch (err: any) {
    const detail = err.response?.data?.message || err.message;
    return { success: false, message: detail, raw: err.response?.data };
  }
}

export async function reduceLeverage(symbol: string, newLeverage: number): Promise<OrderResult> {
  const key = loadKey();
  if (!key) return { success: false, message: 'No private key set. Use /setkey to add one.' };

  const wallet = new ethers.Wallet(key);
  const body = JSON.stringify({ symbol, leverage: newLeverage });

  try {
    const headers = await signedHeaders(wallet, body);
    // Try different leverage-change endpoints
    const endpoints = [
      `${PERPS_BASE}/leverage`,
      `${PERPS_BASE}/accounts/${wallet.address}/leverage`,
      `${PERPS_BASE}/position/leverage`,
    ];
    for (const url of endpoints) {
      try {
        const res = await axios.post(url, body, { headers, timeout: 8000 });
        return { success: true, message: `Leverage changed to ${newLeverage}x for ${symbol}`, raw: res.data };
      } catch { continue; }
    }
    return { success: false, message: `Could not find leverage endpoint. Manual update required on SoDEX.` };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export const sodexTrader = { saveKey, loadKey, removeKey, hasKey, getWalletAddress, placeOrder, closePosition, reduceLeverage };
export default sodexTrader;
