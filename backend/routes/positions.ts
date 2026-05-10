import type { Request, Response } from 'express';
import type { PositionRiskSnapshot } from '../types/domain';

import express from 'express';
import sodex = require('../services/sodex');
import supabaseService = require('../services/supabase');
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

function buildDemoLiveState(wallet: string): LiveStateView {
  return {
    walletAddress: wallet,
    user: wallet,
    accountValue: 2500,
    availableMargin: 1400,
    positions: [
      {
        symbol: 'BTC-USD',
        entryPrice: 80381,
        markPrice: 81240,
        liquidationPrice: 76320,
        leverage: 20,
        positionSide: 'BOTH',
        size: 0.03116,
        marginMode: 'CROSS'
      }
    ],
    balances: []
  };
}

router.get('/', async (req: Request, res: Response) => {
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : process.env.USER_WALLET_ADDRESS;

  try {
    let live: LiveStateView | null = null;

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
      } catch {
        live = buildDemoLiveState(wallet);
      }
    }

    const { data: history, error } = await safeSelect<PositionRiskSnapshot>('position_risks', (query: any) => {
      let nextQuery = query.order('created_at', { ascending: false }).limit(10);
      if (wallet) nextQuery = nextQuery.eq('wallet_address', wallet);
      return nextQuery;
    });

    if (error) {
      return res.status(500).json({ error: error.message, live, history: [] });
    }

    return res.json({
      live,
      history: history || [],
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: getErrorMessage(error),
      live: wallet ? buildDemoLiveState(wallet) : null,
      history: [],
      updatedAt: new Date().toISOString()
    });
  }
});

export = router;
