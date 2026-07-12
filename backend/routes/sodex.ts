import type { Request, Response } from 'express';
import type { AccountState } from '../types/domain';

import express from 'express';
import { ethers } from 'ethers';
import sodex = require('../services/sodex');
import errorUtils = require('../utils/error');
import walletAuth = require('../services/walletAuth');
import technicalGraphAnalysis = require('../services/technicalGraphAnalysis');

const { getErrorMessage } = errorUtils;

const VALID_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);
type SodexNetwork = 'testnet' | 'mainnet';
type SmokeStatus = 'ok' | 'error' | 'skipped';

interface SmokeCheck {
  name: string;
  status: SmokeStatus;
  latencyMs?: number;
  count?: number;
  sample?: unknown;
  error?: string;
}

const router = express.Router();

function parseNetwork(value: unknown): SodexNetwork {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

function authenticatedWallet(req: Request, res: Response): { address: string; network: SodexNetwork } | null {
  const session = walletAuth.getWalletSession(req);
  if (!session) {
    res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
    return null;
  }

  return { address: session.address, network: session.network };
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

async function runSmokeCheck(
  name: string,
  task: () => Promise<unknown>,
  summarize: (value: unknown) => Pick<SmokeCheck, 'count' | 'sample'> = () => ({})
): Promise<SmokeCheck> {
  const startedAt = Date.now();

  try {
    const value = await task();
    return {
      name,
      status: 'ok',
      latencyMs: Date.now() - startedAt,
      ...summarize(value)
    };
  } catch (error) {
    return {
      name,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      error: getErrorMessage(error)
    };
  }
}

function summarizeEnvelope(value: unknown): Pick<SmokeCheck, 'count' | 'sample'> {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const data = payload.data;

  if (Array.isArray(data)) {
    return {
      count: data.length,
      sample: data[0] || null
    };
  }

  if (data && typeof data === 'object') {
    return {
      count: Object.keys(data as Record<string, unknown>).length,
      sample: data
    };
  }

  return {
    sample: value
  };
}

router.get('/account', async (req: Request, res: Response) => {
  const identity = authenticatedWallet(req, res);
  if (!identity) return;
  const { address: wallet, network } = identity;

  try {
    const enriched = await sodex.getEnrichedPositions(wallet, network);
    return res.json({ ...enriched, network });
  } catch (error) {
    console.error('[SoDEX Route] /account error:', getErrorMessage(error));
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

router.get('/smoke', async (req: Request, res: Response) => {
  const network = parseNetwork(req.query.network);
  const symbol = parseSymbol(req.query.symbol) || 'BTC-USD';
  const session = walletAuth.getWalletSession(req);
  const wallet = session?.address || null;
  const checks: SmokeCheck[] = await Promise.all([
    runSmokeCheck('perps.markPrices', () => sodex.getMarkPrices(symbol, network), summarizeEnvelope),
    runSmokeCheck('perps.symbols', () => sodex.getSymbols(network), summarizeEnvelope),
    runSmokeCheck('perps.orderbook', () => sodex.getOrderbook(symbol, 10, network), summarizeEnvelope),
    runSmokeCheck('perps.klines', () => sodex.getKlines(symbol, '1h', 20, network), summarizeEnvelope),
    runSmokeCheck('spot.markets', () => sodex.getSpotMarkets(network), summarizeEnvelope)
  ]);

  if (wallet) {
    if (ethers.isAddress(wallet)) {
      checks.push(await runSmokeCheck(
        'account.state',
        () => sodex.getAccountState(ethers.getAddress(wallet), network),
        (value) => {
          const result = value as { data?: AccountState | null };
          return {
            count: result.data ? 1 : 0,
            sample: result.data
              ? {
                  accountId: result.data.accountId,
                  accountValue: result.data.accountValue,
                  positions: result.data.positions.length,
                  balances: result.data.balances.length
                }
              : null
          };
        }
      ));
    } else {
      checks.push({
        name: 'account.state',
        status: 'skipped',
        error: 'wallet query parameter is not a valid EVM address.'
      });
    }
  }

  const required = checks.filter((check) => check.status !== 'skipped');
  const ok = required.length > 0 && required.every((check) => check.status === 'ok');

  return res.status(ok ? 200 : 502).json({
    ok,
    network,
    symbol,
    wallet: wallet || null,
    endpoints: {
      perps: network === 'mainnet'
        ? process.env.SODEX_MAINNET_PERPS || 'https://mainnet-gw.sodex.dev/api/v1/perps'
        : process.env.SODEX_TESTNET_PERPS || 'https://testnet-gw.sodex.dev/api/v1/perps',
      spot: network === 'mainnet'
        ? process.env.SODEX_MAINNET_SPOT || 'https://mainnet-gw.sodex.dev/api/v1/spot'
        : process.env.SODEX_TESTNET_SPOT || 'https://testnet-gw.sodex.dev/api/v1/spot'
    },
    checks,
    checkedAt: new Date().toISOString()
  });
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
  const identity = authenticatedWallet(req, res);
  if (!identity) return;
  const { address: wallet, network } = identity;

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

router.get('/chart-analysis/:symbol', async (req: Request, res: Response) => {
  const symbol = parseSymbol(req.params.symbol);
  const network = parseNetwork(req.query.network);
  if (!symbol) return res.status(400).json({ error: 'A valid symbol is required.' });
  try {
    const interval = parseInterval(req.query.interval);
    const limit = Math.max(50, parseLimit(req.query.limit, 240, 500));
    const raw = await sodex.getKlines(symbol, interval, limit, network);
    const points = technicalGraphAnalysis.normalizeGraphCandles(raw);
    return res.json(technicalGraphAnalysis.analyzeTechnicalGraph({ symbol, interval, points }));
  } catch (error) {
    const message = getErrorMessage(error);
    return res.status(message.includes('At least 20') ? 422 : 500).json({ error: message });
  }
});

router.get('/login-challenge', (req: Request, res: Response) => {
  const network = parseNetwork(req.query.network);
  const address = typeof req.query.address === 'string' ? req.query.address.trim() : '';

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'A valid EVM wallet address is required.' });
  }

  const checksumAddress = ethers.getAddress(address);
  const challenge = walletAuth.createChallenge(checksumAddress, network);

  return res.json({
    challengeId: challenge.id,
    network,
    chainId: network === 'mainnet' ? 286623 : 138565,
    address: checksumAddress,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    message: challenge.message
  });
});

router.post('/connect', async (req: Request, res: Response) => {
  const payload = (req.body || {}) as Record<string, unknown>;
  const network = parseNetwork(payload.network);
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const signature = typeof payload.signature === 'string' ? payload.signature.trim() : '';
  const challengeId = typeof payload.challengeId === 'string' ? payload.challengeId.trim() : '';

  if (!ethers.isAddress(address)) {
    return res.status(400).json({ error: 'A valid EVM wallet address is required.' });
  }

  if (!signature || !challengeId) {
    return res.status(400).json({ error: 'Wallet signature and challengeId are required.' });
  }

  const checksumAddress = ethers.getAddress(address);
  const challenge = walletAuth.consumeChallenge(challengeId, checksumAddress, network);
  if (!challenge) {
    return res.status(401).json({ error: 'The wallet login challenge is invalid, expired, or already used.' });
  }

  try {
    const recovered = ethers.verifyMessage(walletAuth.buildLoginMessage(challenge), signature);

    if (ethers.getAddress(recovered) !== checksumAddress) {
      return res.status(401).json({ error: 'The signature does not match the selected wallet.' });
    }
  } catch (error) {
    return res.status(401).json({
      error: `Could not verify the wallet signature: ${getErrorMessage(error)}`
    });
  }

  const { token, session } = walletAuth.createSession(checksumAddress, network);
  res.setHeader('Set-Cookie', walletAuth.sessionCookie(req, token));

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
    connectedAt: new Date().toISOString(),
    sessionExpiresAt: new Date(session.expiresAt).toISOString()
  });
});

router.get('/session', async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'No active SoDEX wallet session.' });

  let accountState: AccountState | null = null;
  let accountError: string | null = null;
  try {
    const result = await sodex.getAccountState(session.address, session.network);
    accountState = result.data;
  } catch (error) {
    accountError = getErrorMessage(error);
  }

  return res.json({
    connected: true,
    network: session.network,
    chainId: session.network === 'mainnet' ? 286623 : 138565,
    address: session.address,
    accountId: accountState?.accountId || null,
    accountValue: accountState?.accountValue || 0,
    availableMargin: accountState?.availableMargin || 0,
    accountError,
    connectedAt: new Date(session.issuedAt).toISOString(),
    sessionExpiresAt: new Date(session.expiresAt).toISOString()
  });
});

router.post('/disconnect', (req: Request, res: Response) => {
  res.setHeader('Set-Cookie', walletAuth.clearSessionCookie(req));
  return res.json({ disconnected: true });
});

export = router;
