const express = require('express');

const router = express.Router();

router.post('/', async (req, res) => {
  const {
    action = 'QUEUE_ACTION',
    symbol = 'BTC-USD',
    currentLeverage = null,
    targetLeverage = null
  } = req.body || {};

  const baseMessage = action === 'REDUCE_LEVERAGE' && currentLeverage && targetLeverage
    ? `Action queued - this will reduce your ${symbol} position from ${currentLeverage}x to ${targetLeverage}x. EIP-712 execution coming in Wave 2.`
    : action === 'CLOSE_POSITION'
      ? `Action queued - ${symbol} close request acknowledged. EIP-712 execution coming in Wave 2.`
      : 'Action queued - EIP-712 execution coming in Wave 2.';

  return res.json({
    queued: true,
    action,
    symbol,
    message: baseMessage
  });
});

module.exports = router;
