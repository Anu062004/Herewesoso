const claude = require('./claude');
const gemini = require('./gemini');

const service = (process.env.AI_SERVICE || 'claude').toLowerCase();

if (service === 'gemini') {
  console.log('[AI] Using Gemini');
  module.exports = gemini;
} else {
  console.log('[AI] Using Claude');
  module.exports = claude;
}
