import claude = require('./claude');
import gemini = require('./gemini');
import groq = require('./groq');

const service = (process.env.AI_SERVICE || 'groq').toLowerCase();

const ai = service === 'gemini' ? gemini : service === 'groq' ? groq : claude;

console.log(`[AI] Using ${service.charAt(0).toUpperCase() + service.slice(1)}`);

export = ai;
