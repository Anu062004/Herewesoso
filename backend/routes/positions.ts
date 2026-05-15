import type { Request, Response } from 'express';
import type { PositionRiskSnapshot } from '../types/domain';

import express from 'express';
import sodex = require('../services/sodex');
import supabaseService = require('../services/supabase');
import memoryStore = require('../services/memoryStore');
import errorUtils = require('../utils/error');

const { safeSelect } = supabaseService;
const { getErrorMessage } = errorUtils;

interface LivePositionView {
  symbol: string;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  leverage: number;
  size: number;
  positionSide: string;
  marginMode: string;
}

interface LiveStateView {
  walletAddress: string;
  user: string;
  accountValue: number;
  availableMargin: number;
  positions: LivePositionView[];
  balances: unknown[];
}

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : process.env.USER_WALLET_ADDRESS;

  try {
    // live === null  → SoDEX API unreachable (frontend falls back to Supabase history)
    // live.positions === [] → API reachable, genuinely no open positions (show flat)
    let live: LiveStateView | null = null;
    let liveError: string | null = null;

    if (wallet) {
      try {
        const enriched = await sodex.getEnrichedPositions(wallet);
        const accountState = enriched.accountState;
        live = {
          walletAddress: accountState?.walletAddress || wallet,
          user: accountState?.user || wallet,
          accountValue: accountState?.accountValue || 0,
          availableMargin: accountState?.availableMargin || 0,
          balances: accountState?.balances || [],
          positions: (enriched.positions || []).map((position) => ({
            symbol: position.symbol,
            entryPrice: Number(position.entryPrice || 0),
            markPrice: Number(position.markPrice || 0),
            liquidationPrice: Number(position.liquidationPrice || 0),
            leverage: Number(position.leverage || 0),
            size: Number(position.positionSize || 0),
            positionSide: position.positionSide || 'BOTH',
            marginMode: position.marginMode || 'CROSS'
          }))
        };
      } catch (err) {
        // API unavailable — leave live as null so the frontend can distinguish
        // "no positions" (live=[]) from "can't reach SoDEX" (live=null)
        liveError = getErrorMessage(err);
        live = null;
      }
    }

    const { data: history, error } = await safeSelect<PositionRiskSnapshot>('position_risks', (query: any) => {
      let nextQuery = query.order('created_at', { ascending: false }).limit(10);
      if (wallet) nextQuery = nextQuery.eq('wallet_address', wallet);
      return nextQuery;
    });

    const historyData = (!error && history && history.length > 0)
      ? history
      : memoryStore.getPositionRisks();

    return res.json({
      live,
      liveError,
      history: historyData,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error),
      live: null,
      liveError: getErrorMessage(error),
      history: [],
      updatedAt: new Date().toISOString()
    });
  }
});

export = router;
