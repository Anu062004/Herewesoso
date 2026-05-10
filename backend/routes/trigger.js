const express = require('express');
const { runFullCycle } = require('../agents/orchestrator');

const router = express.Router();

router.post('/', async (_req, res) => {
  res.json({ message: 'Cycle triggered' });
  runFullCycle();
});

module.exports = router;
