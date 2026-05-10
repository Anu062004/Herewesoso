const express = require('express');
const sodex = require('../services/sodex');
const { safeSelect } = require('../services/supabase');

const router = express.Router();

function buildDemoLiveState(wallet) {
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

router.get('/', async (req, res) => {
  const wallet = req.query.wallet || process.env.USER_WALLET_ADDRESS;

  try {
    let live = null;

    if (wallet) {
      try {
        const enriched = await sodex.getEnrichedPositions(wallet);
        live = {
          ...(enriched.accountState || buildDemoLiveState(wallet)),
          positions: (enriched.positions || []).map((position) => ({
            symbol: position.symbol,
            entryPrice: parseFloat(position.entryPrice || 0),
            markPrice: parseFloat(position.markPrice || 0),
            liquidationPrice: parseFloat(position.liquidationPrice || 0),
            leverage: parseFloat(position.leverage || 0),
            size: parseFloat(position.positionSize || 0),
            positionSide: position.positionSide || 'BOTH',
            marginMode: position.marginMode || 'CROSS'
          }))
        };
      } catch (error) {
        live = buildDemoLiveState(wallet);
      }
    }

    const { data: history, error } = await safeSelect('position_risks', (query) => {
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
      error: error.message,
      live: buildDemoLiveState(wallet),
      history: [],
      updatedAt: new Date().toISOString()
    });
  }
});

module.exports = router;
