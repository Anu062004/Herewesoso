import express, { type Request, type Response } from 'express';
import runtimeStatus = require('../services/runtimeStatus');

const { getTelegramRuntimeStatus } = runtimeStatus;

const router = express.Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    telegram: getTelegramRuntimeStatus()
  });
});

export = router;
