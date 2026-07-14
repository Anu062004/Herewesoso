'use client';

import { fetchExecutions } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { usePollingResource } from '@/lib/usePollingResource';

import { EmptyState, ErrorCard, PageHeader, Panel, PanelHeader, Pill, PollingIndicator, SkeletonBlock } from '@/components/terminal/ui';

function statusTone(status: string): 'green' | 'amber' | 'red' | 'cyan' | 'gray' {
  if (status === 'SUCCEEDED') return 'green';
  if (status === 'FAILED' || status === 'REJECTED' || status === 'UNKNOWN') return 'red';
  if (status === 'DRY_RUN' || status === 'SIMULATED') return 'cyan';
  if (status === 'PENDING' || status === 'SUBMITTED' || status === 'CONFIRMED') return 'amber';
  return 'gray';
}

function shortHash(value?: string | null) {
  if (!value) return '-';
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function policyChecks(policySnapshot: Record<string, unknown> | undefined) {
  const checks = policySnapshot?.checks;
  return Array.isArray(checks)
    ? checks.filter((entry): entry is { name?: string; passed?: boolean; message?: string } => typeof entry === 'object' && entry !== null)
    : [];
}

export default function ExecutionsPage() {
  const executions = usePollingResource({ fetcher: () => fetchExecutions(100), intervalMs: 30000 });
  const rows = executions.data || [];
  const successCount = rows.filter((row) => row.status === 'SUCCEEDED').length;
  const rejectedCount = rows.filter((row) => row.status === 'REJECTED').length;
  const signedCount = rows.filter((row) => row.signed_payload_hash).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Execution Audit"
        description="Signed action timeline, policy checks, idempotency keys, and non-sensitive EIP-712 metadata."
        right={<PollingIndicator freshness={executions.freshness} nextPollInMs={executions.nextPollInMs} />}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-5"><div className="text-[12px] text-[var(--text-3)]">Ledger Rows</div><div className="mt-2 text-[28px] font-semibold text-[var(--text-1)]">{rows.length}</div></Panel>
        <Panel className="p-5"><div className="text-[12px] text-[var(--text-3)]">Succeeded</div><div className="mt-2 text-[28px] font-semibold text-[var(--green)]">{successCount}</div></Panel>
        <Panel className="p-5"><div className="text-[12px] text-[var(--text-3)]">Signed Payloads</div><div className="mt-2 text-[28px] font-semibold text-[var(--cyan)]">{signedCount}</div><div className="mt-2 text-[12px] text-[var(--text-3)]">{rejectedCount} rejected by policy</div></Panel>
      </div>

      <Panel>
        <PanelHeader title="Action Timeline" accent="amber" />
        {executions.loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }).map((_, index) => <SkeletonBlock key={index} className="h-16 w-full" />)}
          </div>
        ) : executions.error ? (
          <div className="p-4"><ErrorCard message={executions.error} onRetry={() => void executions.refresh()} /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="No execution records" description="Simulations, dry-runs, rejected policies, and submitted SoDEX actions will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-[var(--bg-panel)] text-[11px] text-[var(--text-3)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Payload Hash</th>
                  <th className="px-4 py-3 font-medium">Idempotency</th>
                  <th className="px-4 py-3 font-medium">Policy</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const checks = policyChecks(row.policy_snapshot);
                  const failures = checks.filter((check) => check.passed === false);

                  return (
                    <tr key={row.action_id} className="border-t border-[var(--border)] text-[13px] align-top">
                      <td className="px-4 py-3 text-[var(--text-2)]">{formatDateTime(row.created_at || null)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-1)]">{row.symbol}</div>
                        <div className="mt-1 text-[11px] text-[var(--text-3)]">{row.action_type} / {row.network}</div>
                      </td>
                      <td className="px-4 py-3"><Pill tone={statusTone(row.status)}>{row.status}</Pill>{row.error ? <div className="mt-2 max-w-[260px] text-[11px] leading-4 text-[var(--red)]">{row.error}</div> : null}</td>
                      <td className="px-4 py-3 text-[var(--text-2)]">{row.execution_mode}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-2)]">{shortHash(row.signed_payload_hash)}</td>
                      <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-2)]">{shortHash(row.idempotency_key)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {checks.length === 0 ? <Pill tone="gray">not captured</Pill> : checks.slice(0, 4).map((check) => (
                            <Pill key={check.name} tone={check.passed === false ? 'red' : 'green'}>{check.name || 'check'}</Pill>
                          ))}
                        </div>
                        {failures[0]?.message ? <div className="mt-2 max-w-[260px] text-[11px] leading-4 text-[var(--text-3)]">{failures[0].message}</div> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
