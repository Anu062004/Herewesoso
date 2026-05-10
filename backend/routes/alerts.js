const express = require('express');
const { safeSelect } = require('../services/supabase');

const router = express.Router();

router.get('/', async (_req, res) => {
  const { data, error } = await safeSelect('alerts', (query) =>
    query.order('created_at', { ascending: false }).limit(20)
  );

  if (error) {
    return res.status(500).json({ error: error.message, data: [] });
  }

  return res.json(data);
});

module.exports = router;
