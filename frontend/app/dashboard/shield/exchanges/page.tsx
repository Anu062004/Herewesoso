'use client';

import type { FormEvent } from 'react';

import { useState } from 'react';

import {
  createShieldConnection,
  deleteShieldConnection,
  fetchCrossExchangeScan,
  fetchShieldConnections,
  type ShieldExchangeConnection
} from '@/lib/api';
import { formatPrice, formatRelativeTime } from '@/lib/format';
import { usePollingResource } from '@/lib/usePollingResource';
import { Button, EmptyState, ErrorCard, MetricCard, PageHeader, Panel, PanelHeader, Pill, SkeletonBlock } from '@/components/terminal/ui';

const fieldClass = 'h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]';

export default function CrossExchangeShieldPage() {
  const connections = usePollingResource({ fetcher: fetchShieldConnections, intervalMs: 30_000 });
  const scan = usePollingResource({ fetcher: fetchCrossExchangeScan, intervalMs: 30_000 });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exchange, setExchange] = useState<'binance' | 'bybit' | 'okx'>('binance');

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await createShieldConnection({
        exchange,
        label: String(data.get('label') || ''),
        credentials: {
          apiKey: String(data.get('apiKey') || ''),
          secret: String(data.get('secret') || ''),
          ...(exchange === 'okx' ? { passphrase: String(data.get('passphrase') || '') } : {})
        }
      });
      form.reset();
      setMessage('Read-only credentials verified and stored as AES-256-GCM ciphertext.');
      await Promise.all([connections.refresh(), scan.refresh()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect exchange.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(connection: ShieldExchangeConnection) {
    setMessage(null);
    try {
      await deleteShieldConnection(connection.id);
      setMessage(`${connection.label} removed.`);
      await Promise.all([connections.refresh(), scan.refresh()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove connection.');
    }
  }

  const summary = scan.data?.summary;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cross-exchange Shield"
        description="Aggregate liquidation exposure across SoDEX, Binance, Bybit, and OKX with wallet-isolated, encrypted read-only connections."
      />
      {message ? <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 text-[13px] text-[var(--text-2)]">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Protected venues" value={summary?.exchangeCount ?? '—'} supporting={`${summary?.positionCount ?? 0} open positions`} />
        <MetricCard label="Gross notional" value={summary ? formatPrice(summary.grossNotional) : '—'} supporting="Across every connected venue" />
        <MetricCard label="Net exposure" value={summary ? formatPrice(summary.netExposure) : '—'} supporting="Signed long minus short" />
        <MetricCard label="Maximum risk" value={summary ? `${summary.maxRiskScore}/100` : '—'} supporting={summary?.riskLevel || 'Awaiting scan'} tone={summary?.riskLevel === 'CRITICAL' || summary?.riskLevel === 'DANGER' ? 'red' : summary?.riskLevel === 'CAUTION' ? 'amber' : 'green'} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(330px,0.7fr)]">
        <Panel>
          <PanelHeader title="Unified exposure" accent="cyan" subtitle={scan.data ? `Scanned ${formatRelativeTime(scan.data.scannedAt)}` : 'Refreshes every 30 seconds'} />
          <div className="space-y-3 p-4">
            {scan.loading ? <><SkeletonBlock className="h-24" /><SkeletonBlock className="h-24" /></> : null}
            {scan.error ? <ErrorCard message={scan.error} onRetry={() => void scan.refresh()} /> : null}
            {!scan.loading && !scan.error && (scan.data?.positions || []).length === 0 ? <EmptyState title="No cross-exchange positions" description="SoDEX is included automatically. Add a read-only CEX connection to aggregate other perpetual positions." /> : null}
            {(scan.data?.positions || []).map((position) => (
              <div key={`${position.connectionId}:${position.symbol}:${position.side}`} className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><span className="text-[15px] font-medium text-[var(--text-1)]">{position.symbol}</span><Pill tone="cyan">{position.exchange}</Pill><Pill tone={position.side === 'SHORT' ? 'red' : 'green'}>{position.side}</Pill></div>
                  <Pill tone={position.analysis.riskLevel === 'CRITICAL' || position.analysis.riskLevel === 'DANGER' ? 'red' : position.analysis.riskLevel === 'CAUTION' ? 'amber' : 'green'}>{position.analysis.score}/100 {position.analysis.riskLevel}</Pill>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-5">
                  <div><span className="text-[var(--text-3)]">Entry</span><div className="mt-1 text-[var(--text-1)]">{formatPrice(position.entryPrice)}</div></div>
                  <div><span className="text-[var(--text-3)]">Mark</span><div className="mt-1 text-[var(--text-1)]">{formatPrice(position.markPrice)}</div></div>
                  <div><span className="text-[var(--text-3)]">Liquidation</span><div className="mt-1 text-[var(--text-1)]">{formatPrice(position.analysis.liquidationPrice)}</div></div>
                  <div><span className="text-[var(--text-3)]">Leverage</span><div className="mt-1 text-[var(--text-1)]">{position.leverage}x</div></div>
                  <div><span className="text-[var(--text-3)]">Distance</span><div className="mt-1 text-[var(--text-1)]">{position.analysis.distancePct.toFixed(1)}%</div></div>
                </div>
              </div>
            ))}
            {(scan.data?.errors || []).map((error) => <div key={`${error.connectionId}:${error.exchange}`} className="rounded-md border border-[rgba(220,38,38,0.22)] px-3 py-2 text-[11px] text-[var(--red)]">{error.exchange}: {error.error}</div>)}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Connections" accent="purple" subtitle="Secrets are write-only and never returned" />
            <div className="space-y-2 p-4">
              {connections.loading ? <SkeletonBlock className="h-20" /> : null}
              {connections.error ? <ErrorCard message={connections.error} onRetry={() => void connections.refresh()} /> : null}
              {(connections.data || []).map((connection) => (
                <div key={connection.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-3">
                  <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-[13px] text-[var(--text-1)]">{connection.label}</span><Pill tone={connection.status === 'ACTIVE' ? 'green' : 'red'}>{connection.exchange}</Pill></div><div className="mt-1 text-[10px] text-[var(--text-3)]">{connection.credentialFingerprint ? `Key ${connection.credentialFingerprint}` : 'SIWE wallet'}{connection.lastError ? ` · ${connection.lastError}` : ''}</div></div>
                  {connection.exchange !== 'sodex' ? <Button className="h-8 px-3" onClick={() => void remove(connection)}>Remove</Button> : null}
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Add read-only exchange" accent="amber" />
            <form className="space-y-3 p-4" onSubmit={connect}>
              <select className={fieldClass} value={exchange} onChange={(event) => setExchange(event.target.value as typeof exchange)}><option value="binance">Binance USD-M</option><option value="bybit">Bybit Linear</option><option value="okx">OKX</option></select>
              <input className={fieldClass} name="label" placeholder="Connection label" maxLength={64} required />
              <input className={fieldClass} name="apiKey" placeholder="Read-only API key" autoComplete="off" required />
              <input className={fieldClass} name="secret" type="password" placeholder="API secret" autoComplete="new-password" required />
              {exchange === 'okx' ? <input className={fieldClass} name="passphrase" type="password" placeholder="OKX passphrase" autoComplete="new-password" required /> : null}
              <button type="submit" disabled={saving} className="h-10 w-full rounded-md border border-[rgba(255,107,0,0.62)] bg-[var(--brand)] px-4 text-[13px] font-medium text-black disabled:opacity-50">{saving ? 'Verifying…' : 'Verify and encrypt'}</button>
              <p className="text-[10px] leading-4 text-[var(--text-3)]">Create keys with trading and withdrawals disabled. Gold &amp; Grith uses account-position read endpoints only.</p>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
