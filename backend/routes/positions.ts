import type { Request, Response } from 'express';
import type { PositionRiskSnapshot } from '../types/domain';

import express from 'express';
import sodex = require('../services/sodex');
import supabaseService = require('../services/supabase');
import memoryStore = require('../services/memoryStore');
import errorUtils = require('../utils/error');
import walletAuth = require('../services/walletAuth');
import riskCalculator = require('../utils/riskCalculator');
import sodexMarketStream = require('../services/sodexMarketStream');

const { safeSelect } = supabaseService;
const { getErrorMessage } = errorUtils;
type SodexNetwork = 'testnet' | 'mainnet';

interface LivePositionView {
  symbol: string;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  leverage: number;
  size: number;
  positionSide: string;
  marginMode: string;
  analysis: ReturnType<typeof riskCalculator.analyzePosition>;
}

interface LiveStateView {
  walletAddress: string;
  user: string;
  accountValue: number;
  availableMargin: number;
  initialMargin: number;
  crossMargin: number;
  portfolioRisk: {
    grossNotional: number;
    netExposure: number;
    concentrationPct: number;
    correlatedExposurePct: number;
    stressLoss5Pct: number;
    riskLevel: string;
  };
  positions: LivePositionView[];
  balances: unknown[];
}

const router = express.Router();

function parseNetwork(value: unknown): SodexNetwork {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

function parseNumber(value: unknown): number {
  return Number.parseFloat(String(value ?? '0')) || 0;
}

function findRows(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['data', 'items', 'rows', 'klines', 'fundings', 'bids', 'asks']) {
    const rows = findRows(value[key]);
    if (rows.length) return rows;
  }
  return [];
}

function marketMetrics(klinesRaw: any, orderbookRaw: any, fundingRaw: any) {
  const klines = findRows(klinesRaw);
  const closes = klines.map((row) => parseNumber(row.close ?? row.c ?? (Array.isArray(row) ? row[4] : 0))).filter((value) => value > 0);
  const returns = closes.slice(1).map((close, index) => Math.abs((close - closes[index]) / closes[index] * 100));
  const volatilityPct = returns.length ? Math.sqrt(returns.reduce((sum, value) => sum + value * value, 0) / returns.length) : 0;

  const book = orderbookRaw?.data || orderbookRaw || {};
  const bids = findRows(book.bids || book.B || []);
  const asks = findRows(book.asks || book.A || []);
  const priceOf = (row: any) => parseNumber(row.price ?? row.p ?? (Array.isArray(row) ? row[0] : 0));
  const sizeOf = (row: any) => parseNumber(row.size ?? row.quantity ?? row.q ?? (Array.isArray(row) ? row[1] : 0));
  const bestBid = priceOf(bids[0]);
  const bestAsk = priceOf(asks[0]);
  const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
  const spreadPct = midpoint ? (bestAsk - bestBid) / midpoint * 100 : 0;
  const depth = [...bids.slice(0, 10), ...asks.slice(0, 10)].reduce((sum, row) => sum + priceOf(row) * sizeOf(row), 0);
  const liquidityScore = Math.min(100, spreadPct * 500 + (depth > 0 ? Math.max(0, 35 - Math.log10(depth + 1) * 6) : 45));

  const fundingRows = findRows(fundingRaw);
  const latestFunding = fundingRows[0] || fundingRaw?.data || {};
  const fundingRate = parseNumber(latestFunding?.fundingRate ?? latestFunding?.rate ?? latestFunding?.r);
  const signedReturns = closes.slice(1).map((close, index) => (close - closes[index]) / closes[index]);
  return { volatilityPct, liquidityScore, fundingRate, returns: signedReturns };
}

function correlation(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 5) return 0;
  const a = left.slice(-length); const b = right.slice(-length);
  const meanA = a.reduce((sum, value) => sum + value, 0) / length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / length;
  const covariance = a.reduce((sum, value, index) => sum + (value - meanA) * (b[index] - meanB), 0);
  const varianceA = a.reduce((sum, value) => sum + (value - meanA) ** 2, 0);
  const varianceB = b.reduce((sum, value) => sum + (value - meanB) ** 2, 0);
  return varianceA && varianceB ? covariance / Math.sqrt(varianceA * varianceB) : 0;
}

function portfolioSummary(positions: Array<{ markPrice: number; size: number; marketReturns?: number[]; analysis: ReturnType<typeof riskCalculator.analyzePosition> }>, accountValue: number) {
  const grossNotional = positions.reduce((sum, position) => sum + position.analysis.notional, 0);
  const netExposure = positions.reduce((sum, position) => sum + position.markPrice * position.size, 0);
  const largest = Math.max(0, ...positions.map((position) => position.analysis.notional));
  const correlatedNotional = positions.reduce((sum, position, index) => {
    const highlyCorrelated = positions.some((other, otherIndex) => otherIndex !== index && Math.abs(correlation(position.marketReturns || [], other.marketReturns || [])) >= 0.7);
    return sum + (highlyCorrelated ? position.analysis.notional : 0);
  }, 0);
  const stressLoss5Pct = positions.reduce((sum, position) => {
    const scenario = position.analysis.stressScenarios.find((item) => item.movePct === -5);
    return sum + Math.min(0, scenario?.estimatedPnl || 0);
  }, 0);
  const concentrationPct = grossNotional > 0 ? largest / grossNotional * 100 : 0;
  const correlatedExposurePct = grossNotional > 0 ? correlatedNotional / grossNotional * 100 : 0;
  const stressLossRatio = accountValue > 0 ? Math.abs(stressLoss5Pct) / accountValue * 100 : 0;
  return {
    grossNotional: Number(grossNotional.toFixed(2)),
    netExposure: Number(netExposure.toFixed(2)),
    concentrationPct: Number(concentrationPct.toFixed(1)),
    correlatedExposurePct: Number(correlatedExposurePct.toFixed(1)),
    stressLoss5Pct: Number(stressLoss5Pct.toFixed(2)),
    riskLevel: stressLossRatio > 30 || concentrationPct > 80 ? 'CRITICAL' : stressLossRatio > 15 || concentrationPct > 60 ? 'DANGER' : stressLossRatio > 7 ? 'CAUTION' : 'SAFE'
  };
}

router.get('/', async (req: Request, res: Response) => {
  const session = walletAuth.getWalletSession(req);
  if (!session) return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  const wallet = session.address;
  const network = parseNetwork(session.network);

  try {
    // live === null  → SoDEX API unreachable (frontend falls back to Supabase history)
    // live.positions === [] → API reachable, genuinely no open positions (show flat)
    let live: LiveStateView | null = null;
    let liveError: string | null = null;

    if (wallet) {
      try {
        const enriched = await sodex.getEnrichedPositions(wallet, network);
        const accountState = enriched.accountState;
        const accountValue = accountState?.accountValue || 0;
        const availableMargin = accountState?.availableMargin || 0;
        const initialMargin = accountState?.initialMargin || 0;
        const analyzedPositions = await Promise.all((enriched.positions || []).map(async (position) => {
          const size = parseNumber(position.positionSize);
          const markPrice = parseNumber(position.markPrice || position.entryPrice);
          const marketResults = await Promise.allSettled([
            sodex.getKlines(position.symbol, '1h', 48, network),
            sodex.getOrderbook(position.symbol, 20, network),
            sodex.getFundingHistory(wallet, position.symbol, network)
          ]);
          const metrics = marketMetrics(
            marketResults[0].status === 'fulfilled' ? marketResults[0].value : null,
            marketResults[1].status === 'fulfilled' ? marketResults[1].value : null,
            marketResults[2].status === 'fulfilled' ? marketResults[2].value : null
          );
          const realtimeTick = sodexMarketStream.getMarketTick(position.symbol, network);
          const realtimeMarkPrice = realtimeTick?.markPrice || markPrice;
          return {
            symbol: position.symbol,
            entryPrice: parseNumber(position.entryPrice),
            markPrice: realtimeMarkPrice,
            liquidationPrice: parseNumber(position.liquidationPrice),
            leverage: parseNumber(position.leverage),
            size,
            positionSide: riskCalculator.resolveDirection(position.positionSide || position.side, size),
            marginMode: position.marginMode || 'CROSS',
            marketReturns: metrics.returns,
            analysis: riskCalculator.analyzePosition({
              markPrice: realtimeMarkPrice,
              liquidationPrice: parseNumber(position.liquidationPrice),
              entryPrice: parseNumber(position.entryPrice),
              leverage: parseNumber(position.leverage),
              positionSize: size,
              positionSide: position.positionSide || position.side,
              accountValue,
              availableMargin,
              initialMargin,
              unrealizedPnl: parseNumber((position as any).unrealizedPnL),
              volatilityPct: metrics.volatilityPct,
              liquidityScore: metrics.liquidityScore,
              fundingRate: realtimeTick?.fundingRate || metrics.fundingRate
            })
          };
        }));
        live = {
          walletAddress: accountState?.walletAddress || wallet,
          user: accountState?.user || wallet,
          accountValue,
          availableMargin,
          initialMargin,
          crossMargin: accountState?.crossMargin || 0,
          balances: accountState?.balances || [],
          positions: analyzedPositions,
          portfolioRisk: portfolioSummary(analyzedPositions, accountValue)
        };
      } catch (err) {
        // API unavailable — leave live as null so the frontend can distinguish
        // "no positions" (live=[]) from "can't reach SoDEX" (live=null)
        liveError = getErrorMessage(err);
        live = null;
      }
    }

    let historyData: unknown[] = [];

    // Stored risk snapshots predate network tagging, so only expose them on testnet.
    if (network === 'testnet') {
      const { data: history, error } = await safeSelect<PositionRiskSnapshot>('position_risks', (query: any) => {
        let nextQuery = query.order('created_at', { ascending: false }).limit(10);
        if (wallet) nextQuery = nextQuery.eq('wallet_address', wallet);
        return nextQuery;
      });

      historyData = (!error && history && history.length > 0)
        ? history
        : memoryStore.getPositionRisks();
    }

    return res.json({
      live,
      liveError,
      history: historyData,
      network,
      updatedAt: new Date().toISOString(),
      stream: sodexMarketStream.status(network)
    });
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error),
      live: null,
      liveError: getErrorMessage(error),
      history: [],
      network,
      updatedAt: new Date().toISOString()
    });
  }
});

export = router;
