import type { Request, Response } from 'express';
import type { AccountState } from '../types/domain';

import express from 'express';
import { ethers } from 'ethers';
import sodex = require('../services/sodex');
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

const VALID_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
type SodexNetwork = 'testnet' | 'mainnet';

const router = express.Router();

function parseNetwork(value: unknown): SodexNetwork {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

function buildLoginMessage(address: string, network: SodexNetwork, issuedAt: number): string {
  return [
    'Gold & Grith SoDEX login',
    `Wallet: ${address}`,
    `Environment: ${network}`,
    `Issued at: ${issuedAt}`,
    '',
    'This signature proves wallet ownership. It does not authorize a trade or transfer.'
  ].join('\n');
}

function getWallet(req: Request): string | null {
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet.trim() : process.env.USER_WALLET_ADDRESS;
  return wallet || null;
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseSymbol(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const symbol = value.trim().toUpperCase();
  return symbol || null;
}

function parseInterval(value: unknown): string {
  if (typeof value !== 'string') {
    return '1h';
  }

  return VALID_INTERVALS.has(value) ? value : '1h';
}

router.get('/account', async (req: Request, res: Response) => {
  const wallet = getWallet(req);
  const network = parseNetwork(req.query.network);

  if (!wallet) {
    return res.status(400).json({ error: 'No wallet address provided.' });
  }

  try {
    const enriched = await sodex.getEnrichedPositions(wallet, network);
    return res.json({ ...enriched, network });
  } catch (error) {
    console.error('[SoDEX Route] /account error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/markets', async (req: Request, res: Response) => {
  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : null;
  const network = parseNetwork(req.query.network);

  try {
    const markPrices = await sodex.getMarkPrices(symbol, network);
    return res.json(markPrices);
  } catch (error) {
    console.error('[SoDEX Route] /markets error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/orderbook/:symbol', async (req: Request, res: Response) => {
  const symbol = parseSymbol(req.params.symbol);
  const network = parseNetwork(req.query.network);

  if (!symbol) {
    return res.status(400).json({ error: 'A valid symbol is required.' });
  }

  try {
    const limit = parseLimit(req.query.limit, 20, 100);
    const orderbook = await sodex.getOrderbook(symbol, limit, network);
    return res.json(orderbook);
  } catch (error) {
    console.error('[SoDEX Route] /orderbook error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/orders', async (req: Request, res: Response) => {
  const wallet = getWallet(req);
  const network = parseNetwork(req.query.network);

  if (!wallet) {
    return res.status(400).json({ error: 'No wallet address provided.' });
  }

  const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : undefined;

  try {
    const orders = await sodex.getOpenOrders(wallet, symbol || undefined, network);
    return res.json(orders);
  } catch (error) {
    console.error('[SoDEX Route] /orders error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/klines/:symbol', async (req: Request, res: Response) => {
  const symbol = parseSymbol(req.params.symbol);
  const network = parseNetwork(req.query.network);

  if (!symbol) {
    return res.status(400).json({ error: 'A valid symbol is required.' });
  }

  try {
    const interval = parseInterval(req.query.interval);
    const limit = parseLimit(req.query.limit, 100, 500);
    const klines = await sodex.getKlines(symbol, interval, limit, network);
    return res.json(klines);
  } catch (error) {
    console.error('[SoDEX Route] /klines error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.post('/connect', async (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const network = parseNetwork(payload.network);
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const signature = typeof payload.signature === 'string' ? payload.signature.trim() : '';
  const issuedAt = Number(payload.issuedAt);

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'A valid EVM wallet address is required.' });
  }

  if (!signature || !Number.isFinite(issuedAt)) {
    return res.status(400).json({ error: 'Wallet signature and issuedAt are required.' });
  }

  if (Math.abs(Date.now() - issuedAt) > LOGIN_WINDOW_MS) {
    return res.status(400).json({ error: 'The wallet login request expired. Please sign again.' });
  }

  const checksumAddress = ethers.getAddress(address);
  const message = buildLoginMessage(checksumAddress.toLowerCase(), network, issuedAt);

  try {
    const recovered = ethers.verifyMessage(message, signature);

    if (ethers.getAddress(recovered) !== checksumAddress) {
      return res.status(401).json({ error: 'The signature does not match the selected wallet.' });
    }
  } catch (error) {
    return res.status(401).json({
      error: `Could not verify the wallet signature: ${getErrorMessage(error)}`
    });
  }

  let accountState: AccountState | null = null;
  let accountError: string | null = null;

  try {
    const result = await sodex.getAccountState(checksumAddress, network);
    accountState = result.data;
  } catch (error) {
    accountError = getErrorMessage(error);
  }

  return res.json({
    connected: true,
    network,
    chainId: network === 'mainnet' ? 286623 : 138565,
    address: checksumAddress,
    accountId: accountState?.accountId || null,
    accountValue: accountState?.accountValue || 0,
    availableMargin: accountState?.availableMargin || 0,
    accountError,
    connectedAt: new Date().toISOString()
  });
});

export = router;
