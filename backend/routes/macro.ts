import type { Request, Response } from 'express';
import type { MacroEvent } from '../types/domain';

import express from 'express';
import sosovalue = require('../services/sosovalue');
import delayUtils = require('../utils/delay');
import errorUtils = require('../utils/error');

const { delay } = delayUtils;
const { getErrorMessage } = errorUtils;

const router = express.Router();

function toDate(daysFromNow = 0): string {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const today = await sosovalue.getMacroEvents(toDate(0));
    await delay(500);
    const tomorrow = await sosovalue.getMacroEvents(toDate(1));
    const data = [
      ...((today?.data || []) as MacroEvent[]),
      ...((tomorrow?.data || []) as MacroEvent[])
    ];
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: getErrorMessage(error), data: [] });
  }
});

export = router;
