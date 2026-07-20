'use client';

import type { FormEvent } from 'react';

import { useState } from 'react';

import {
  fetchAutomationConfig,
  fetchAutomationRules,
  prepareAutomationRule,
  registerAutomationRule
} from '@/lib/api';
import { usePollingResource } from '@/lib/usePollingResource';
import { EmptyState, ErrorCard, PageHeader, Panel, PanelHeader, Pill, SkeletonBlock } from '@/components/terminal/ui';

const fieldClass = 'h-10 w-full rounded-md border border-[var(--border)] bg-[var(--bg-panel)] px-3 font-mono text-[12px] text-[var(--text-1)] outline-none focus:border-[var(--brand)]';

async function waitForReceipt(transactionHash: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const receipt = await window.ethereum?.request({ method: 'eth_getTransactionReceipt', params: [transactionHash] });
    if (receipt) return receipt;
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
  }
  throw new Error('Transaction confirmation timed out. The transaction may still confirm; refresh before retrying.');
}

export default function AutomationPage() {
  const config = usePollingResource({ fetcher: fetchAutomationConfig, intervalMs: 30_000 });
  const rules = usePollingResource({ fetcher: fetchAutomationRules, intervalMs: 30_000 });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function createRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      if (!window.ethereum) throw new Error('An EIP-1193 wallet is required to create an on-chain rule.');
      const data = new FormData(event.currentTarget);
      const validForHours = Number(data.get('validForHours') || 24);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const prepared = await prepareAutomationRule({
        adapter: String(data.get('adapter') || ''),
        checker: String(data.get('checker') || ''),
        executionData: String(data.get('executionData') || '0x'),
        checkData: String(data.get('checkData') || '0x'),
        validAfter: currentTimestamp,
        validUntil: validForHours > 0 ? currentTimestamp + Math.floor(validForHours * 3600) : 0,
        minInterval: Number(data.get('minInterval') || 300),
        maxExecutions: Number(data.get('maxExecutions') || 1),
        maxGasPriceGwei: Number(data.get('maxGasPriceGwei') || 0)
      });
      const transactionHash = String(await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [prepared.transaction]
      }));
      setMessage(`Transaction ${transactionHash.slice(0, 10)}… submitted; waiting for confirmation.`);
      await waitForReceipt(transactionHash);
      await registerAutomationRule({
        transactionHash,
        metadata: { executionDataHash: prepared.commitment?.executionDataHash, checkDataHash: prepared.commitment?.checkDataHash }
      });
      setMessage('Automation rule confirmed and indexed. Any keeper can now execute it only when its checker approves.');
      event.currentTarget.reset();
      await rules.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create the automation rule.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Onchain Automation"
        description="Create non-custodial Shield rules with committed calldata, checker-gated execution, adapter allowlisting, cooldowns, and execution caps."
      />

      {message ? <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-4 py-3 text-[13px] text-[var(--text-2)]">{message}</div> : null}

      <Panel>
        <PanelHeader title="Deployment status" accent="cyan" />
        <div className="flex flex-wrap items-center gap-3 p-4 text-[12px] text-[var(--text-2)]">
          {config.loading ? <SkeletonBlock className="h-8 w-72" /> : config.error ? <ErrorCard message={config.error} onRetry={() => void config.refresh()} /> : (
            <>
              <Pill tone={config.data?.configured ? 'green' : 'amber'}>{config.data?.configured ? 'Contract configured' : 'Not deployed'}</Pill>
              <span>Chain {config.data?.chainId}</span>
              <code className="break-all text-[var(--text-3)]">{config.data?.contractAddress || 'Set SHIELD_AUTOMATION_*_CONTRACT_ADDRESS after deployment'}</code>
              <div className="basis-full flex flex-wrap gap-1">{config.data?.safeguards.map((guard) => <Pill key={guard}>{guard}</Pill>)}</div>
            </>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(330px,0.7fr)_minmax(0,1.3fr)]">
        <Panel>
          <PanelHeader title="Create rule" accent="amber" subtitle="Your wallet submits this transaction directly" />
          <form className="space-y-3 p-4" onSubmit={createRule}>
            <label className="block text-[11px] text-[var(--text-3)]">Approved adapter<input name="adapter" className={`${fieldClass} mt-1`} placeholder="0x…" required /></label>
            <label className="block text-[11px] text-[var(--text-3)]">Risk checker<input name="checker" className={`${fieldClass} mt-1`} placeholder="0x…" required /></label>
            <label className="block text-[11px] text-[var(--text-3)]">Execution calldata<input name="executionData" className={`${fieldClass} mt-1`} defaultValue="0x" required /></label>
            <label className="block text-[11px] text-[var(--text-3)]">Checker calldata<input name="checkData" className={`${fieldClass} mt-1`} defaultValue="0x" required /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[11px] text-[var(--text-3)]">Valid hours<input name="validForHours" className={`${fieldClass} mt-1`} type="number" min="1" max="8760" defaultValue="24" /></label>
              <label className="block text-[11px] text-[var(--text-3)]">Cooldown seconds<input name="minInterval" className={`${fieldClass} mt-1`} type="number" min="0" max="31536000" defaultValue="300" /></label>
              <label className="block text-[11px] text-[var(--text-3)]">Execution cap<input name="maxExecutions" className={`${fieldClass} mt-1`} type="number" min="1" max="10000" defaultValue="1" /></label>
              <label className="block text-[11px] text-[var(--text-3)]">Max gas (gwei)<input name="maxGasPriceGwei" className={`${fieldClass} mt-1`} type="number" min="0" defaultValue="0" /></label>
            </div>
            <button type="submit" disabled={submitting || !config.data?.configured} className="h-10 w-full rounded-md border border-[rgba(255,107,0,0.62)] bg-[var(--brand)] px-4 text-[13px] font-medium text-black disabled:opacity-50">
              {submitting ? 'Confirming…' : 'Create with wallet'}
            </button>
            <p className="text-[10px] leading-4 text-[var(--text-3)]">Only use independently audited checker and adapter contracts. The executor never holds funds; protocol delegation remains under your wallet.</p>
          </form>
        </Panel>

        <Panel>
          <PanelHeader title="Indexed rules" accent="purple" subtitle="Confirmed RuleCreated events owned by this wallet" />
          <div className="space-y-3 p-4">
            {rules.loading ? <><SkeletonBlock className="h-24" /><SkeletonBlock className="h-24" /></> : null}
            {rules.error ? <ErrorCard message={rules.error} onRetry={() => void rules.refresh()} /> : null}
            {!rules.loading && !rules.error && (rules.data || []).length === 0 ? <EmptyState title="No automation rules" description="After deployment is configured, create a checker-gated rule with your connected wallet." /> : null}
            {(rules.data || []).map((rule) => (
              <div key={String(rule.id)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] p-4">
                <div className="flex items-center justify-between gap-3"><div className="text-[14px] font-medium text-[var(--text-1)]">Rule #{String(rule.onchain_rule_id)}</div><Pill tone={rule.status === 'ACTIVE' ? 'green' : 'gray'}>{String(rule.status)}</Pill></div>
                <div className="mt-3 grid gap-2 font-mono text-[10px] text-[var(--text-3)] sm:grid-cols-2"><span className="break-all">Adapter {String(rule.adapter_address)}</span><span className="break-all">Checker {String(rule.checker_address)}</span><span className="break-all sm:col-span-2">Transaction {String(rule.creation_tx_hash)}</span></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
