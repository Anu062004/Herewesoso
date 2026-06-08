'use client';

import Link from 'next/link';
import { useState } from 'react';

import { fetchHealth, fetchPositions, queueDashboardAction } from '@/lib/api';
import { formatPercent, formatPrice } from '@/lib/format';
import {
  computeDistancePercent,
  latestRiskBySymbol,
  positionStatus,
  resolvePositions,
  riskLabel,
  scoreFromDistance
} from '@/lib/terminal';
import { useSodexConnection } from '@/lib/useSodexConnection';
import { usePollingResource } from '@/lib/usePollingResource';

import { ConfirmationModal } from '@/components/terminal/ConfirmationModal';
import { RefreshIcon } from '@/components/terminal/icons';
import {
  DistanceBar,
  EmptyState,
  ErrorCard,
  PageHeader,
  Panel,
  PanelHeader,
  Pill,
  PollingIndicator,
  SkeletonBlock
} from '@/components/terminal/ui';

type PendingAction =
  | {
      action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION';
      symbol: string;
      currentLeverage: number;
      targetLeverage?: number;
    }
  | null;

function isNoOpenPositionMessage(message: string | undefined) {
  return Boolean(message?.toLowerCase().includes('no open position found'));
}

export default function PositionsPage() {
  const connection = useSodexConnection();
  const network = connection?.network || 'testnet';
  const networkLabel = network === 'mainnet' ? 'Mainnet' : 'Testnet';
  const mainnetReadOnly = network === 'mainnet';
  const health = usePollingResource({ fetcher: fetchHealth, intervalMs: 60000 });
  const tradingKeyConfigured = health.data?.sodex?.tradingKeyConfigured;
  const positions = usePollingResource({
    fetcher: fetchPositions,
    intervalMs: 30000,
    key: `${network}:${connection?.address || 'env'}`
  });
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const state = positions.data || { live: null, history: [] };
  const resolved = resolvePositions(state);
  const latestRisk = latestRiskBySymbol(state.history);

  return (
    <div className="space-y-4">
      {resolved.fallbackActive && resolved.positions.length > 0 ? (
        <div className="flex h-9 items-center rounded-[10px] border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] px-4 text-[13px] text-[var(--amber)]">
          Warning: SoDEX position fetch failed - showing demo BTC-USD testnet position
        </div>
      ) : null}

      {mainnetReadOnly ? (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.12)] px-4 py-3 text-[13px] text-[var(--amber)] sm:flex-row sm:items-center sm:justify-between">
          <span>Mainnet is read-only in this dashboard. Use the official SoDEX app to enable trading or submit orders.</span>
          <Link href="/dashboard/sodex/connect" className="text-[12px] text-[var(--text-1)] underline underline-offset-4">
            Manage connection
          </Link>
        </div>
      ) : null}

      {tradingKeyConfigured === false ? (
        <div className="flex flex-col gap-2 rounded-[10px] border border-[rgba(220,38,38,0.24)] bg-[rgba(220,38,38,0.12)] px-4 py-3 text-[13px] text-[var(--red)] sm:flex-row sm:items-center sm:justify-between">
          <span>The EC2 backend does not have a SoDEX API signing key configured. Closing and leverage changes cannot execute yet.</span>
          <Link href="/dashboard/telegram" className="text-[12px] text-[var(--text-1)] underline underline-offset-4">
            Check Telegram /setkey
          </Link>
        </div>
      ) : null}

      <PageHeader
        title="Positions"
        description={`${networkLabel} account polling every 30s`}
        right={
          <div className="flex items-center gap-3">
            <PollingIndicator freshness={positions.freshness} nextPollInMs={positions.nextPollInMs} />
            <button
              type="button"
              onClick={() => void positions.refresh()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-[13px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)]"
            >
              <RefreshIcon className={positions.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Refresh
            </button>
          </div>
        }
      />

      <Panel>
        <PanelHeader title="Open Positions" accent="cyan" subtitle={`${networkLabel} account view`} />
        <div className="overflow-x-auto">
          {positions.loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : positions.error ? (
            <div className="p-4">
              <ErrorCard message={positions.error} onRetry={() => void positions.refresh()} />
            </div>
          ) : resolved.positions.length === 0 ? (
            <EmptyState title="No open positions" description="The table will populate after a SoDEX position is opened." />
          ) : (
            <table className="min-w-[1100px] text-left">
              <thead className="sticky top-0 z-10 bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Side</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Entry Price</th>
                  <th className="px-4 py-3 font-medium">Mark Price</th>
                  <th className="px-4 py-3 font-medium">Liquidation Price</th>
                  <th className="px-4 py-3 font-medium">Distance%</th>
                  <th className="px-4 py-3 font-medium">Risk Score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {resolved.positions.map((position) => {
                  const snapshot = latestRisk.get(position.symbol);
                  const distance = snapshot?.distance_to_liquidation_pct ?? computeDistancePercent(position);
                  const riskScore = snapshot?.risk_score ?? scoreFromDistance(distance);
                  const risk = riskLabel({ distance, riskLevel: snapshot?.risk_level, riskScore });
                  const status = positionStatus(distance);

                  return (
                    <tr key={position.symbol} className="border-t border-[var(--border)] text-[13px] hover:bg-[var(--bg-panel)]">
                      <td className="px-4 py-3 text-[var(--text-1)]">{position.symbol}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{position.positionSide === 'SHORT' || position.size < 0 ? 'Short' : 'Long'}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{Math.abs(position.size)}</td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{formatPrice(position.entryPrice)}</td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{formatPrice(position.markPrice)}</td>
                      <td className="px-4 py-3 text-[var(--text-1)]">{formatPrice(position.liquidationPrice)}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <div className={risk.tone === 'green' ? 'text-[var(--green)]' : risk.tone === 'amber' ? 'text-[var(--amber)]' : 'text-[var(--red)]'}>
                            {formatPercent(distance, 1)}
                          </div>
                          <DistanceBar percent={distance} compact />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={risk.tone === 'green' ? 'green' : risk.tone === 'amber' ? 'amber' : 'red'}>{Math.round(riskScore)}</Pill>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={status.tone === 'green' ? 'green' : 'amber'}>{status.label}</Pill>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={mainnetReadOnly || tradingKeyConfigured === false}
                            onClick={() =>
                              setPendingAction({
                                action: 'REDUCE_LEVERAGE',
                                symbol: position.symbol,
                                currentLeverage: position.leverage,
                                targetLeverage: Math.max(Math.floor(position.leverage / 4), 5)
                              })
                            }
                            className="inline-flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-[12px] text-[var(--text-2)] transition hover:border-[var(--border-hover)] hover:text-[var(--text-1)] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Reduce
                          </button>
                          <button
                            type="button"
                            disabled={mainnetReadOnly || tradingKeyConfigured === false}
                            onClick={() =>
                              setPendingAction({
                                action: 'CLOSE_POSITION',
                                symbol: position.symbol,
                                currentLeverage: position.leverage
                              })
                            }
                            className="inline-flex h-8 items-center rounded-md border border-[rgba(239,68,68,0.28)] px-3 text-[12px] text-[var(--red)] transition hover:border-[rgba(239,68,68,0.5)] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <ConfirmationModal
        open={Boolean(pendingAction)}
        title={pendingAction?.action === 'REDUCE_LEVERAGE' ? 'Reduce Leverage' : 'Close Position'}
        description={
          pendingAction?.action === 'REDUCE_LEVERAGE'
            ? `This will reduce ${pendingAction?.symbol} from ${pendingAction?.currentLeverage}x to ${pendingAction?.targetLeverage}x on SoDEX ${networkLabel.toLowerCase()}.`
            : `This will submit a reduce-only market close for ${pendingAction?.symbol} on SoDEX ${networkLabel.toLowerCase()}.`
        }
        confirmLabel={pendingAction?.action === 'REDUCE_LEVERAGE' ? 'Reduce' : 'Close'}
        disclaimer={
          mainnetReadOnly
            ? 'Mainnet execution is blocked in this dashboard'
            : tradingKeyConfigured === false
              ? 'The backend SoDEX signer is not configured on EC2'
              : 'Testnet execution - signs through the configured SoDEX key'
        }
        onClose={() => setPendingAction(null)}
        onConfirm={async () => {
          if (!pendingAction) {
            return { message: 'No action configured.' };
          }

          if (tradingKeyConfigured === false) {
            throw new Error('The EC2 backend does not have a SoDEX API signing key configured.');
          }

          const result = await queueDashboardAction({
            action: pendingAction.action,
            symbol: pendingAction.symbol,
            currentLeverage: pendingAction.currentLeverage,
            targetLeverage: pendingAction.targetLeverage
          });

          if (!result.queued && isNoOpenPositionMessage(result.message)) {
            await positions.refresh();

            return {
              title: 'Position already closed',
              message: result.message
            };
          }

          if (!result.queued) {
            throw new Error(result.message);
          }

          await positions.refresh();

          return {
            title: pendingAction.action === 'REDUCE_LEVERAGE' ? 'Leverage update sent' : 'Close request sent',
            message: result.message
          };
        }}
      />
    </div>
  );
}
