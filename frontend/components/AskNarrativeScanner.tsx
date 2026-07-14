'use client';

import { useState } from 'react';
import { askNarrativeScanner, saveRecommendationStatus, type NarrativeAdvisorResponse } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Button, Panel, PanelHeader, Pill } from '@/components/terminal/ui';

const SUGGESTIONS = [
  'Why is the top narrative moving?',
  'Which narrative is strongest right now?',
  'How much could I invest in AI?',
  'What would invalidate the DeFi narrative?',
  'Which narrative fits my wallet?'
];

export default function AskNarrativeScanner() {
  const [question, setQuestion] = useState('');
  const [investableAmount, setInvestableAmount] = useState(1000);
  const [riskMode, setRiskMode] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [answer, setAnswer] = useState<NarrativeAdvisorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function submit(nextQuestion = question) {
    if (!nextQuestion.trim()) return;
    setQuestion(nextQuestion);
    setLoading(true); setError(''); setSaved('');
    try {
      setAnswer(await askNarrativeScanner({ question: nextQuestion, investableAmount, riskMode }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The scanner could not answer this question.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Ask Narrative Scanner" accent="purple" subtitle="Grounded answers from current evidence, SoDEX markets, and this wallet" />
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => void submit(suggestion)} className="rounded-full border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 text-[11px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]">
              {suggestion}
            </button>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_150px_auto]">
          <input aria-label="Narrative question" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }} placeholder="Ask about a narrative, asset, allocation, portfolio fit, or invalidation..." className="h-10 rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]" />
          <input type="number" min="0" max="1000000" value={investableAmount} onChange={(event) => setInvestableAmount(Number(event.target.value))} aria-label="Investable amount" className="h-10 rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]" />
          <select aria-label="Risk mode" value={riskMode} onChange={(event) => setRiskMode(event.target.value as typeof riskMode)} className="h-10 rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]">
            <option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option>
          </select>
          <Button tone="primary" disabled={loading || !question.trim()} onClick={() => void submit()}>{loading ? 'Analyzing...' : 'Ask Scanner'}</Button>
        </div>
        <div className="text-[10px] text-[var(--text-3)]">Amount is used only for a rules-based scenario. Sentiment alone can never authorize an allocation.</div>
        {error ? <div className="rounded-md border border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.08)] p-3 text-[12px] text-[var(--red)]">{error}</div> : null}
        {answer ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
            <div className="flex flex-wrap items-center gap-2"><Pill tone="purple">{answer.intent}</Pill><Pill tone="cyan">{answer.sector}</Pill><span className="text-[10px] text-[var(--text-3)]">Data {formatDateTime(answer.dataTimestamp)}</span></div>
            <p className="mt-3 text-[13px] leading-6 text-[var(--text-1)]">{answer.answer}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(answer.metrics).map(([label, value]) => <Pill key={label} tone="gray">{label}: {String(value)}</Pill>)}
            </div>
            {answer.scenario ? (
              <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <div className="text-[12px] font-medium text-[var(--text-1)]">Allocation scenario: ${answer.scenario.lowAmount.toLocaleString()}–${answer.scenario.highAmount.toLocaleString()}</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">{answer.scenario.allocations.map((item) => <div key={item.symbol} className="text-[11px] text-[var(--text-2)]">{item.symbol}: {item.percentage}% · ${item.lowAmount}–${item.highAmount}</div>)}</div>
                {answer.scenario.reasons.length ? <p className="mt-2 text-[11px] text-[var(--amber)]">{answer.scenario.reasons.join(' ')}</p> : null}
              </div>
            ) : null}
            {answer.evidence.length ? <div className="mt-4 space-y-1 text-[11px] text-[var(--text-2)]">{answer.evidence.map((item) => <div key={item}>• {item}</div>)}</div> : null}
            <div className="mt-4 text-[11px] text-[var(--text-3)]">Invalidation: {answer.invalidation}</div>
            {answer.recommendationId ? <div className="mt-4 flex items-center gap-2"><Button onClick={() => void saveRecommendationStatus(answer.recommendationId as string, 'SAVED').then(() => setSaved('Saved'))}>Save scenario</Button><Button onClick={() => void saveRecommendationStatus(answer.recommendationId as string, 'REJECTED').then(() => setSaved('Dismissed'))}>Dismiss</Button><span className="text-[11px] text-[var(--green)]">{saved}</span></div> : null}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
