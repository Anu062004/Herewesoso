import type { Request, Response } from 'express';
import express from 'express';
import sosovalue = require('../services/sosovalue');
import errorUtils = require('../utils/error');

const { getErrorMessage } = errorUtils;
const router = express.Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await sosovalue.getSSIList();
    return res.json(result.data || []);
  } catch (error) {
    console.warn('[SSI] Could not fetch SSI list:', getErrorMessage(error));
    return res.json([]);
  }
});

export = router;
