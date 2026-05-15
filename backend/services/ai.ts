import claude = require('./claude');
import gemini = require('./gemini');
import groq = require('./groq');
import grok = require('./grok');
// SkillMint is lazy-required at runtime only when AI_SERVICE=skillmint.
// Eager import causes a ReferenceError in skillmint.ts under tsx (skillmint_module
// not defined), crashing the entire server even when skillmint is not in use.

const service = (process.env.AI_SERVICE || 'groq').toLowerCase();

// Pick the adapter for the current AI_SERVICE setting.
// 'grok' and 'xai' both map to the xAI Grok service (recommended).
// Set AI_SERVICE=skillmint to flip onto verifiable TEE execution on 0G.
const ai =
  service === 'gemini' ? gemini :
  service === 'groq' ? groq :
  (service === 'grok' || service === 'xai') ? grok :
  service === 'skillmint' ? require('./skillmint') :
  claude;

console.log(`[AI] Using ${service.charAt(0).toUpperCase() + service.slice(1)}`);

export = ai;
