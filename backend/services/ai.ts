import claude = require('./claude');
import gemini = require('./gemini');

const service = (process.env.AI_SERVICE || 'claude').toLowerCase();
const ai = service === 'gemini' ? gemini : claude;

console.log(`[AI] Using ${service === 'gemini' ? 'Gemini' : 'Claude'}`);

export = ai;
