import type { Request, Response } from 'express';
import type { NarrativeScoreRow } from '../types/domain';
import express from 'express';
import walletAuth = require('../services/walletAuth');
import supabaseService = require('../services/supabase');
import sodex = require('../services/sodex');
import { answerNarrativeQuestion, type AdvisorPosition, type AdvisorRiskMode } from '../services/narrativeAdvisor';
import { boundedNumber } from '../utils/validation';
import { asyncHandler } from '../utils/asyncHandler';

const router = express.Router();
const { safeInsert, safeSelect, safeUpdate } = supabaseService;

function sessionOr401(req: Request, res: Response) {
  const session = walletAuth.getWalletSession(req);
  if (!session) res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.' });
  return session;
}

async function latestSignals(): Promise<NarrativeScoreRow[]> {
  const { data } = await safeSelect<NarrativeScoreRow & { created_at?: string }>('narrative_scores', (query: any) =>
    query.order('created_at', { ascending: false }).limit(64)
  );
  const seen = new Set<string>();
  return data.filter((row) => {
    if (seen.has(row.sector)) return false;
    seen.add(row.sector);
    return true;
  });
}

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const session = sessionOr401(req, res);
  if (!session) return;
  const body = (req.body || {}) as Record<string, unknown>;
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1000) : '';
  if (question.length < 3) return res.status(400).json({ error: 'Ask a trading or narrative question.' });
  const riskMode: AdvisorRiskMode = body.riskMode === 'conservative' || body.riskMode === 'aggressive' ? body.riskMode : 'balanced';
  const investableAmount = boundedNumber(body.investableAmount, 0, 0, 1_000_000);
  const signals = await latestSignals();
  let positions: AdvisorPosition[] = [];
  try {
    const state = await sodex.getEnrichedPositions(session.address, session.network);
    positions = (state.positions || []).map((position: any) => ({
      symbol: String(position.symbol || '').toUpperCase(),
      notional: Math.abs(Number(position.positionSize || 0)) * Number(position.markPrice || position.entryPrice || 0)
    }));
  } catch {}

  try {
    const answer = answerNarrativeQuestion({ question, signals, positions, investableAmount, riskMode });
    const snapshot = { signals: signals.map((signal) => ({ sector: signal.sector, score: signal.combined_score, stage: signal.lifecycle_stage, confidence: signal.confidence })), positionCount: positions.length };
    const rows = await safeInsert('narrative_conversations', {
      wallet_address: session.address.toLowerCase(), question, intent: answer.intent, sector: answer.sector,
      answer: answer.answer, evidence: answer.evidence, metrics: answer.metrics, scenario: answer.scenario,
      risk_mode: riskMode, investable_amount: investableAmount, data_snapshot: snapshot
    });
    let recommendationId: string | null = null;
    if (answer.scenario?.eligible) {
      const recommendations = await safeInsert('narrative_recommendations', {
        wallet_address: session.address.toLowerCase(), conversation_id: rows?.[0]?.id || null,
        sector: answer.sector, risk_mode: riskMode, investable_amount: investableAmount,
        low_amount: answer.scenario.lowAmount, high_amount: answer.scenario.highAmount,
        allocation: answer.scenario.allocations, rationale: answer.answer, evidence: answer.evidence,
        invalidation: answer.invalidation, status: 'SHOWN', data_timestamp: answer.dataTimestamp
      });
      recommendationId = String(recommendations?.[0]?.id || '') || null;
    }
    return res.json({ ...answer, conversationId: rows?.[0]?.id || null, recommendationId });
  } catch (error: any) {
    console.error('[Narrative Ask Route]', error?.message || error);
    return res.status(500).json({ error: 'Could not answer from current narrative data.' });
  }
}));

router.get('/history', asyncHandler(async (req: Request, res: Response) => {
  const session = sessionOr401(req, res); if (!session) return;
  const { data, error } = await safeSelect('narrative_conversations', (query: any) =>
    query.eq('wallet_address', session.address.toLowerCase()).order('created_at', { ascending: false }).limit(30)
  );
  if (error) return res.status(503).json({ error: 'Conversation history is temporarily unavailable.' });
  return res.json(data);
}));

router.get('/recommendations', asyncHandler(async (req: Request, res: Response) => {
  const session = sessionOr401(req, res); if (!session) return;
  const { data, error } = await safeSelect('narrative_recommendations', (query: any) =>
    query.eq('wallet_address', session.address.toLowerCase()).order('created_at', { ascending: false }).limit(30)
  );
  if (error) return res.status(503).json({ error: 'Recommendations are temporarily unavailable.' });
  return res.json(data);
}));

router.post('/recommendations/:id/feedback', asyncHandler(async (req: Request, res: Response) => {
  const session = sessionOr401(req, res); if (!session) return;
  const status = ['ACCEPTED', 'REJECTED', 'SAVED'].includes(String(req.body?.status)) ? String(req.body.status) : null;
  if (!status) return res.status(400).json({ error: 'Use ACCEPTED, REJECTED, or SAVED.' });
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(req.params.id))) {
    return res.status(400).json({ error: 'A valid recommendation ID is required.' });
  }
  await safeUpdate('narrative_recommendations', { status, feedback_at: new Date().toISOString() }, {
    id: String(req.params.id),
    wallet_address: session.address.toLowerCase()
  });
  return res.json({ saved: true, status });
}));

export = router;
