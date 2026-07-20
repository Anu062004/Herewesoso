'use client';

import type { FormEvent } from 'react';

import { useState } from 'react';

import {
  createStrategy,
  fetchStrategies,
  installStrategy,
  publishStrategy,
  uninstallStrategy,
  type MarketplaceStrategy
} from '@/lib/api';
import { shortWallet } from '@/lib/sodexConnection';
import { usePollingResource } from '@/lib/usePollingResource';
import { Button, EmptyState, ErrorCard, PageHeader, Panel, PanelHeader, Pill, SkeletonBlock } from '@/components/terminal/ui';

const fieldClass = 'h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]';

export default function StrategiesPage() {
  const catalog = usePollingResource({ fetcher: () => fetchStrategies(), intervalMs: 30_000 });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    try {
      const draft = await createStrategy({
        slug: String(data.get('slug') || ''),
        name: String(data.get('name') || ''),
        summary: String(data.get('summary') || ''),
        description: String(data.get('description') || ''),
        category: String(data.get('category') || ''),
        riskLevel: String(data.get('riskLevel') || 'MEDIUM') as 'LOW' | 'MEDIUM' | 'HIGH',
        supportedExchanges: data.getAll('exchanges').map(String),
        configurationSchema: {},
        executionTemplate: { mode: 'advisory', action: 'QUEUE_ACTION' }
      });
      await publishStrategy(draft.id);
      event.currentTarget.reset();
      setMessage('Strategy published with an immutable version hash.');
      await catalog.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not publish strategy.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleInstall(strategy: MarketplaceStrategy) {
    setBusyId(strategy.id);
    setMessage(null);
    try {
      if (strategy.installed) await uninstallStrategy(strategy.id);
      else await installStrategy(strategy.id);
      await catalog.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Marketplace action failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Strategy Marketplace"
        description="Publish immutable strategy manifests, install wallet-scoped versions, and separate verified performance evidence from unverified claims."
      />

      {message ? <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 text-[13px] text-[var(--text-2)]">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">
        <Panel>
          <PanelHeader title="Published strategies" accent="purple" subtitle="Installation is tied to the currently authenticated SIWE wallet" />
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {catalog.loading ? <><SkeletonBlock className="h-48" /><SkeletonBlock className="h-48" /></> : null}
            {catalog.error ? <div className="md:col-span-2"><ErrorCard message={catalog.error} onRetry={() => void catalog.refresh()} /></div> : null}
            {!catalog.loading && !catalog.error && (catalog.data || []).length === 0 ? (
              <div className="md:col-span-2"><EmptyState title="No published strategies" description="Publish the first version from the creator panel. The API records its manifest and SHA-256 content hash." /></div>
            ) : null}
            {(catalog.data || []).map((strategy) => (
              <article key={strategy.id} className="flex min-h-48 flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={strategy.risk_level === 'HIGH' ? 'red' : strategy.risk_level === 'MEDIUM' ? 'amber' : 'green'}>{strategy.risk_level} risk</Pill>
                  <Pill tone="cyan">v{strategy.current_version}</Pill>
                  {strategy.verifiedPerformance.length > 0 ? <Pill tone="green">Verified evidence</Pill> : <Pill tone="gray">No verified evidence</Pill>}
                </div>
                <h2 className="mt-3 text-[16px] font-semibold text-[var(--text-1)]">{strategy.name}</h2>
                <p className="mt-2 flex-1 text-[13px] leading-5 text-[var(--text-2)]">{strategy.summary}</p>
                <div className="mt-3 text-[11px] text-[var(--text-3)]">
                  By {shortWallet(strategy.owner_address)} · {strategy.install_count} installs · {strategy.rating ? `${strategy.rating}/5` : 'unrated'}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">{strategy.supported_exchanges.map((exchange) => <Pill key={exchange}>{exchange}</Pill>)}</div>
                  <Button tone={strategy.installed ? 'ghost' : 'primary'} disabled={busyId === strategy.id} onClick={() => void toggleInstall(strategy)}>
                    {busyId === strategy.id ? 'Saving…' : strategy.installed ? 'Uninstall' : 'Install'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Publish a strategy" accent="amber" subtitle="Published manifests cannot be edited in place" />
          <form className="space-y-3 p-4" onSubmit={submit}>
            <input className={fieldClass} name="name" placeholder="Strategy name" minLength={3} maxLength={80} required />
            <input className={fieldClass} name="slug" placeholder="unique-strategy-slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
            <input className={fieldClass} name="category" placeholder="Category (for example Risk)" minLength={3} maxLength={40} required />
            <input className={fieldClass} name="summary" placeholder="Short marketplace summary" minLength={10} maxLength={240} required />
            <textarea className="min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-3 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]" name="description" placeholder="Explain the logic, inputs, invalidation, and execution boundaries." minLength={20} maxLength={10000} required />
            <select className={fieldClass} name="riskLevel" defaultValue="MEDIUM"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select>
            <fieldset className="rounded-md border border-[var(--border)] p-3">
              <legend className="px-1 text-[11px] text-[var(--text-3)]">Supported venues</legend>
              <div className="grid grid-cols-2 gap-2 text-[12px] text-[var(--text-2)]">
                {['sodex', 'binance', 'bybit', 'okx', 'onchain'].map((exchange) => <label key={exchange} className="flex items-center gap-2"><input type="checkbox" name="exchanges" value={exchange} defaultChecked={exchange === 'sodex'} />{exchange}</label>)}
              </div>
            </fieldset>
            <button type="submit" disabled={creating} className="h-10 w-full rounded-md border border-[rgba(255,107,0,0.62)] bg-[var(--brand)] px-4 text-[13px] font-medium text-black disabled:opacity-50">
              {creating ? 'Publishing…' : 'Create and publish v1'}
            </button>
            <p className="text-[10px] leading-4 text-[var(--text-3)]">Performance submissions remain pending until an independent verifier promotes the evidence. Publishing does not imply profitability.</p>
          </form>
        </Panel>
      </div>
    </div>
  );
}
