import type { Request, Response } from 'express';

import express from 'express';
import telegram = require('../services/telegram');
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;

const router = express.Router();

router.post('/', async (_req: Request, res: Response) => {
  try {
    const sent = await telegram.sendTest();

    if (!sent) {
      return res.status(503).json({
        error: 'Telegram is not configured or the message could not be delivered.'
      });
    }

    return res.json({ message: 'Test message sent to Telegram' });
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error) });
  }
});

export = router;
