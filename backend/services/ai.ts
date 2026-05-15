import claude = require('./claude');
import gemini = require('./gemini');
import groq = require('./groq');
import grok = require('./grok');
// SkillMint adapter — routes every memo through TEE-attested execution on 0G.
// Drop-in compatible with the other adapters (same 3 methods, same shapes).
// Adds two extra methods (`getLastReceipt`, `isReady`) for agents that want to
// capture the on-chain receipt rootHash alongside the memo content.
// See backend/services/skillmint.ts for the full integration rationale.
import skillmint = require('./skillmint');

const service = (process.env.AI_SERVICE || 'groq').toLowerCase();

// Pick the adapter for the current AI_SERVICE setting.
// 'grok' and 'xai' both map to the xAI Grok service (recommended).
// Set AI_SERVICE=skillmint to flip onto verifiable TEE execution on 0G.
const ai =
  service === 'gemini' ? gemini :
  service === 'groq' ? groq :
  (service === 'grok' || service === 'xai') ? grok :
  service === 'skillmint' ? skillmint :
  claude;

console.log(`[AI] Using ${service.charAt(0).toUpperCase() + service.slice(1)}`);

export = ai;
