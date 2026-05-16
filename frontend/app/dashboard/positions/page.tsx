'use client';

import { useEffect, useState } from 'react';
import { fetchPositions, fetchAlerts } from '@/lib/api';
import PositionRiskCard from '@/components/PositionRiskCard';
import RiskGauge from '@/components/RiskGauge';
import ExecuteModal from '@/components/ExecuteModal';
import { queueDashboardAction } from '@/lib/api';
import type { PositionsResponse, AlertRow, LivePosition, PositionSnapshot, MemoRow } from '@/lib/types';
import { fetchMemos } from '@/lib/api';

type PendingAction = {
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION';
  symbol: string;
  currentLeverage: number;
  targetLeverage?: number;
} | null;

function latestRiskBySymbol(history: PositionSnapshot[]) {
  const map = new Map<string, PositionSnapshot>();
  [...history]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .forEach((snapshot) => {
      if (!map.has(snapshot.symbol)) map.set(snapshot.symbol, snapshot);
    });
  return map;
}

function latestRiskMemoBySymbol(memos: MemoRow[]) {
  const map = new Map<string, MemoRow>();
  memos
    .filter((m) => m.memo_type === 'RISK_ALERT' && m.related_symbol)
    .forEach((m) => {
      if (m.related_symbol && !map.has(m.related_symbol)) map.set(m.related_symbol, m);
    });
  return map;
}

function fallbackPositions(history: PositionSnapshot[]): LivePosition[] {
  const seen = latestRiskBySymbol(history);
  return [...seen.values()].map((s) => ({
    symbol: s.symbol,
    entryPrice: s.entry_price,
    markPrice: s.mark_price,
    liquidationPrice: s.liquidation_price,
    leverage: s.leverage,
    size: s.position_size,
    positionSide: 'BOTH',
    marginMode: 'CROSS',
  }));
}

export default function PositionsPage() {
  const [positions, setPositions] = useState<PositionsResponse>({ live: null, history: [] });
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [memos, setMemos] = useState<MemoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const [posRes, alertRes, memoRes] = await Promise.all([
      fetchPositions(),
      fetchAlerts(),
      fetchMemos(),
    ]);
    setPositions(posRes);
    setAlerts(alertRes);
    setMemos(memoRes);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const apiReachable = positions.live !== null;
  const livePositions = apiReachable
    ? (positions.live?.positions || [])
    : fallbackPositions(positions.history);
  const latestRisk = latestRiskBySymbol(positions.history);
  const latestRiskMemos = latestRiskMemoBySymbol(memos);
  const wallet = positions.live?.walletAddress || positions.history[0]?.wallet_address || '';

  // Compute overall risk
  const overallRisk = livePositions.length > 0
    ? Math.round(
        livePositions.reduce((sum, p) => {
          const snap = latestRisk.get(p.symbol);
          return sum + (snap?.risk_score || 0);
        }, 0) / livePositions.length
      )
    : 0;

  const riskAlerts = alerts.filter(a => a.alert_type === 'LIQUIDATION_RISK' || a.severity === 'CRITICAL' || a.severity === 'DANGER');

  async function handleConfirm() {
    if (!pendingAction) return;
    setIsSubmitting(true);
    const result = await queueDashboardAction({
      action: pendingAction.action,
      symbol: pendingAction.symbol,
      currentLeverage: pendingAction.currentLeverage,
      targetLeverage: pendingAction.targetLeverage,
    });
    setStatusMessage(result.message);
    setIsSubmitting(false);
    setPendingAction(null);
  }

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-8 sm:px-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-safe">Liquidation Shield</p>
            <h1 className="mt-2 font-headline text-3xl font-bold text-white sm:text-4xl">Current Positions</h1>
            <p className="mt-2 text-sm text-zinc-400">
              SoDEX perpetual position monitoring with real-time risk scoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
              apiReachable
                ? 'border-safe/30 bg-safe/10 text-safe'
                : 'border-caution/30 bg-caution/10 text-caution'
            }`}>
              {apiReachable ? '✓ SoDEX Online' : '⚠ Offline'}
            </span>
            <button
              onClick={loadData}
              disabled={loading}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-xs font-semibold text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? '⏳ Refreshing…' : '⟳ Refresh'}
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-zinc-100">
            {statusMessage}
          </div>
        )}

        {/* Overview Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <div className="panel rounded-2xl p-5">
            <p className="data-label">Open Positions</p>
            <p className="mt-2 font-mono text-3xl font-bold text-white">{livePositions.length}</p>
          </div>
          <div className="panel rounded-2xl p-5">
            <p className="data-label">Wallet</p>
            <p className="mt-2 font-mono text-sm font-semibold text-accent truncate">
              {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Not connected'}
            </p>
          </div>
          <div className="panel rounded-2xl p-5">
            <p className="data-label">Risk Alerts</p>
            <p className={`mt-2 font-mono text-3xl font-bold ${riskAlerts.length > 0 ? 'text-danger' : 'text-safe'}`}>
              {riskAlerts.length}
            </p>
          </div>
          <div className="panel rounded-2xl p-5">
            <p className="data-label">Avg Risk Score</p>
            <p className={`mt-2 font-mono text-3xl font-bold ${
              overallRisk < 30 ? 'text-safe' : overallRisk < 60 ? 'text-caution' : 'text-danger'
            }`}>
              {overallRisk}<span className="text-sm text-zinc-500">/100</span>
            </p>
          </div>
        </div>

        {/* Position Cards */}
        {loading ? (
          <div className="flex flex-col items-center gap-4 py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-safe border-t-transparent" />
            <p className="font-mono text-xs text-zinc-500">Loading positions from SoDEX…</p>
          </div>
        ) : (
          <section className="mt-6 space-y-6">
            {livePositions.length > 0 ? (
              livePositions.map((position) => (
                <PositionRiskCard
                  key={position.symbol}
                  position={position}
                  snapshot={latestRisk.get(position.symbol)}
                  memo={latestRiskMemos.get(position.symbol)}
                  onReduce={() =>
                    setPendingAction({
                      action: 'REDUCE_LEVERAGE',
                      symbol: position.symbol,
                      currentLeverage: position.leverage,
                      targetLeverage: Math.max(Math.floor(position.leverage / 4), 5),
                    })
                  }
                  onClose={() =>
                    setPendingAction({
                      action: 'CLOSE_POSITION',
                      symbol: position.symbol,
                      currentLeverage: position.leverage,
                    })
                  }
                />
              ))
            ) : (
              <section className="panel rounded-3xl p-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-safe/10 border border-safe/20">
                  <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-safe" stroke="currentColor" strokeWidth="1.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h2 className="font-headline text-2xl font-bold text-white">No Open Positions</h2>
                <p className="mt-3 text-sm text-zinc-400 max-w-md mx-auto">
                  {apiReachable
                    ? 'All positions are closed on SoDEX. Open a position on the testnet to start monitoring.'
                    : 'SoDEX API is currently unreachable. Connect to SoDEX to view your positions.'}
                </p>
                <a
                  href="https://testnet.sodex.dev"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-mono text-sm font-bold text-black transition hover:bg-white"
                >
                  Open SoDEX →
                </a>
              </section>
            )}
          </section>
        )}

        {/* Recent Risk Alerts */}
        {riskAlerts.length > 0 && (
          <section className="mt-8">
            <div className="panel rounded-2xl p-6">
              <p className="eyebrow text-danger mb-3">Risk Alerts</p>
              <div className="space-y-3">
                {riskAlerts.slice(0, 5).map((alert) => (
                  <article
                    key={alert.id || `${alert.title}-${alert.created_at}`}
                    className="rounded-xl border border-danger/20 bg-danger/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-white">{alert.title}</h3>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {alert.created_at ? new Date(alert.created_at).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">{alert.message}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <ExecuteModal
        open={Boolean(pendingAction)}
        action={pendingAction?.action || null}
        symbol={pendingAction?.symbol || null}
        currentLeverage={pendingAction?.currentLeverage}
        targetLeverage={pendingAction?.targetLeverage}
        isSubmitting={isSubmitting}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
