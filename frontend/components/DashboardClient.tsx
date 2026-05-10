'use client';

import { useEffect, useState } from 'react';
import AlertFeed from '@/components/AlertFeed';
import ExecuteModal from '@/components/ExecuteModal';
import MacroCalendar from '@/components/MacroCalendar';
import NarrativeHeatmap from '@/components/NarrativeHeatmap';
import PositionRiskCard from '@/components/PositionRiskCard';
import StatusBar from '@/components/StatusBar';
import TradeMemo from '@/components/TradeMemo';
import {
  fetchAlerts,
  fetchMacro,
  fetchMemos,
  fetchPositions,
  fetchSignals,
  queueDashboardAction,
  sendTelegramTest,
  triggerCycle
} from '@/lib/api';
import type { DashboardData, LivePosition, MemoRow, PositionSnapshot } from '@/lib/types';

type PendingAction =
  | {
      action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION';
      symbol: string;
      currentLeverage: number;
      targetLeverage?: number;
    }
  | null;

function timeAgo(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin === 1) return '1 min ago';
  return `${diffMin} min ago`;
}

function latestRiskBySymbol(history: PositionSnapshot[]) {
  const map = new Map<string, PositionSnapshot>();

  [...history]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .forEach((snapshot) => {
      if (!map.has(snapshot.symbol)) {
        map.set(snapshot.symbol, snapshot);
      }
    });

  return map;
}

function latestRiskMemoBySymbol(memos: MemoRow[]) {
  const map = new Map<string, MemoRow>();

  memos
    .filter((memo) => memo.memo_type === 'RISK_ALERT' && memo.related_symbol)
    .forEach((memo) => {
      if (memo.related_symbol && !map.has(memo.related_symbol)) {
        map.set(memo.related_symbol, memo);
      }
    });

  return map;
}

function fallbackPositions(history: PositionSnapshot[]): LivePosition[] {
  const seen = latestRiskBySymbol(history);
  return [...seen.values()].map((snapshot) => ({
    symbol: snapshot.symbol,
    entryPrice: snapshot.entry_price,
    markPrice: snapshot.mark_price,
    liquidationPrice: snapshot.liquidation_price,
    leverage: snapshot.leverage,
    size: snapshot.position_size,
    positionSide: 'BOTH',
    marginMode: 'CROSS'
  }));
}

export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [signals, setSignals] = useState(initialData.signals);
  const [positions, setPositions] = useState(initialData.positions);
  const [alerts, setAlerts] = useState(initialData.alerts);
  const [memos, setMemos] = useState(initialData.memos);
  const [macro, setMacro] = useState(initialData.macro);
  const [lastUpdated, setLastUpdated] = useState(initialData.positions.updatedAt || new Date().toISOString());
  const [isRunning, setIsRunning] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const positionsInterval = setInterval(async () => {
      const next = await fetchPositions();
      setPositions(next);
      setLastUpdated(next.updatedAt || new Date().toISOString());
    }, 30000);

    const signalsInterval = setInterval(async () => {
      setSignals(await fetchSignals());
    }, 60000);

    const alertsInterval = setInterval(async () => {
      setAlerts(await fetchAlerts());
    }, 30000);

    const memosInterval = setInterval(async () => {
      setMemos(await fetchMemos());
    }, 60000);

    const macroInterval = setInterval(async () => {
      setMacro(await fetchMacro());
    }, 300000);

    return () => {
      clearInterval(positionsInterval);
      clearInterval(signalsInterval);
      clearInterval(alertsInterval);
      clearInterval(memosInterval);
      clearInterval(macroInterval);
    };
  }, []);

  const livePositions = positions.live?.positions?.length
    ? positions.live.positions
    : fallbackPositions(positions.history);
  const latestRisk = latestRiskBySymbol(positions.history);
  const latestRiskMemos = latestRiskMemoBySymbol(memos);
  const wallet = positions.live?.walletAddress || positions.history[0]?.wallet_address || '';

  async function handleRunNow() {
    setIsRunning(true);
    const result = await triggerCycle();
    setStatusMessage(result.message);

    const nextPositions = await fetchPositions();
    setPositions(nextPositions);
    setLastUpdated(nextPositions.updatedAt || new Date().toISOString());
    setSignals(await fetchSignals());
    setAlerts(await fetchAlerts());
    setMemos(await fetchMemos());
    setMacro(await fetchMacro());
    setIsRunning(false);
  }

  async function handleTestTelegram() {
    const result = await sendTelegramTest();
    setStatusMessage(result.message);
  }

  async function handleConfirmAction() {
    if (!pendingAction) return;

    setIsSubmittingAction(true);
    const result = await queueDashboardAction({
      action: pendingAction.action,
      symbol: pendingAction.symbol,
      currentLeverage: pendingAction.currentLeverage,
      targetLeverage: pendingAction.targetLeverage
    });
    setStatusMessage(result.message);
    setIsSubmittingAction(false);
    setPendingAction(null);
  }

  return (
    <>
      <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-8 sm:px-10">
        <StatusBar
          wallet={wallet}
          lastUpdated={timeAgo(lastUpdated)}
          onRunNow={handleRunNow}
          onTestTelegram={handleTestTelegram}
          isRunning={isRunning}
        />

        {statusMessage ? (
          <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-zinc-100">
            {statusMessage}
          </div>
        ) : null}

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
                    targetLeverage: Math.max(Math.floor(position.leverage / 4), 5)
                  })
                }
                onClose={() =>
                  setPendingAction({
                    action: 'CLOSE_POSITION',
                    symbol: position.symbol,
                    currentLeverage: position.leverage
                  })
                }
              />
            ))
          ) : (
            <section className="panel rounded-3xl p-6">
              <p className="eyebrow">Liquidation Shield</p>
              <h2 className="mt-3 font-headline text-2xl font-bold text-white">No open positions</h2>
              <p className="mt-4 text-sm leading-7 text-zinc-400">
                The shield will populate automatically when SoDEX returns an open testnet position or when a risk snapshot exists in Supabase.
              </p>
            </section>
          )}
        </section>

        <section className="mt-6">
          <NarrativeHeatmap signals={signals} />
        </section>

        <section className="mt-6">
          <MacroCalendar events={macro} />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <TradeMemo memos={memos} />
          <AlertFeed alerts={alerts} />
        </section>
      </main>

      <ExecuteModal
        open={Boolean(pendingAction)}
        action={pendingAction?.action || null}
        symbol={pendingAction?.symbol || null}
        currentLeverage={pendingAction?.currentLeverage}
        targetLeverage={pendingAction?.targetLeverage}
        isSubmitting={isSubmittingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirmAction}
      />
    </>
  );
}
