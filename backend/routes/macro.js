const express = require('express');
const sosovalue = require('../services/sosovalue');
const { delay } = require('../utils/delay');

const router = express.Router();

function toDate(daysFromNow = 0) {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString().split('T')[0];
}

router.get('/', async (_req, res) => {
  try {
    const today = await sosovalue.getMacroEvents(toDate(0));
    await delay(500);
    const tomorrow = await sosovalue.getMacroEvents(toDate(1));
    const data = [...(today?.data || []), ...(tomorrow?.data || [])];
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message, data: [] });
  }
});

module.exports = router;
