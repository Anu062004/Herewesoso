import express from 'express';

import deliveryEvidence = require('../services/deliveryEvidence');
import { rateLimit } from '../middleware/security';

const router = express.Router();

router.get('/', rateLimit({ name: 'delivery-evidence', windowMs: 60_000, max: 30, distributed: true }), async (_req, res) => {
  const evidence = await deliveryEvidence.getDeliveryEvidence();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.json(evidence);
});

export = router;
