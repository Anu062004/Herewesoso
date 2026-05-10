import express, { type Request, type Response } from 'express';

const router = express.Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

export = router;
