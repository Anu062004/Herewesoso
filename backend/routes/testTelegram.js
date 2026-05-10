const express = require('express');
const telegram = require('../services/telegram');

const router = express.Router();

router.post('/', async (_req, res) => {
  try {
    const sent = await telegram.sendTest();

    if (!sent) {
      return res.status(503).json({
        error: 'Telegram is not configured or the message could not be delivered.'
      });
    }

    res.json({ message: 'Test message sent to Telegram' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
