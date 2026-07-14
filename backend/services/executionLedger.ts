import crypto from 'crypto';

import type { ExecutionActionRow } from '../types/domain';

import supabaseService = require('./supabase');
import { isProduction } from '../config/env';

const { safeInsert, safeSelect, safeUpdate, strictInsert, strictSelect, strictUpdate, isSupabaseConfigured } = supabaseService;

const memoryExecutions: ExecutionActionRow[] = [];

function now() {
  return new Date().toISOString();
}

function createActionId() {
  return crypto.randomUUID();
}

function pushMemory(row: ExecutionActionRow) {
  const index = memoryExecutions.findIndex((entry) => entry.action_id === row.action_id);
  if (index >= 0) {
    memoryExecutions[index] = { ...memoryExecutions[index], ...row };
  } else {
    memoryExecutions.unshift(row);
    memoryExecutions.splice(100);
  }
}

async function recordExecutionAction(row: Omit<ExecutionActionRow, 'created_at' | 'updated_at'>) {
  const stamped: ExecutionActionRow = {
    ...row,
    created_at: now(),
    updated_at: now()
  };
  pushMemory(stamped);
  await safeInsert('execution_actions', stamped);
  return stamped;
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate?.code === '23505' || String(candidate?.message || '').toLowerCase().includes('duplicate key');
}

async function claimExecutionAction(
  row: Omit<ExecutionActionRow, 'created_at' | 'updated_at'>
): Promise<{ claimed: boolean; row: ExecutionActionRow }> {
  const stamped: ExecutionActionRow = { ...row, created_at: now(), updated_at: now() };

  if (!isSupabaseConfigured) {
    const existing = memoryExecutions.find((entry) => entry.idempotency_key === row.idempotency_key);
    if (existing) return { claimed: false, row: existing };
    pushMemory(stamped);
    return { claimed: true, row: stamped };
  }

  try {
    const inserted = await strictInsert('execution_actions', stamped);
    const saved = (inserted[0] as unknown as ExecutionActionRow | undefined) || stamped;
    pushMemory(saved);
    return { claimed: true, row: saved };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await strictSelect<ExecutionActionRow>('execution_actions', (query: any) =>
      query.eq('idempotency_key', row.idempotency_key).limit(1)
    );
    if (!existing[0]) throw error;
    return { claimed: false, row: existing[0] };
  }
}

async function findRecentExecution(input: {
  requestedBy: string | null;
  actionType: string;
  symbol: string;
  network: 'testnet' | 'mainnet';
  since: string;
}): Promise<ExecutionActionRow | null> {
  const activeStatuses = ['PENDING', 'CONFIRMED', 'SUBMITTED', 'SUCCEEDED'];
  if (!isSupabaseConfigured) {
    return memoryExecutions.find((entry) =>
      entry.requested_by === input.requestedBy &&
      entry.action_type === input.actionType &&
      entry.symbol === input.symbol &&
      entry.network === input.network &&
      activeStatuses.includes(entry.status) &&
      new Date(entry.created_at || 0).getTime() >= new Date(input.since).getTime()
    ) || null;
  }

  const rows = await strictSelect<ExecutionActionRow>('execution_actions', (query: any) => {
    let next = query
      .eq('action_type', input.actionType)
      .eq('symbol', input.symbol)
      .eq('network', input.network)
      .in('status', activeStatuses)
      .gte('created_at', input.since)
      .order('created_at', { ascending: false })
      .limit(1);
    if (input.requestedBy) next = next.eq('requested_by', input.requestedBy);
    return next;
  });
  return rows[0] || null;
}

async function updateExecutionAction(actionId: string, values: Partial<ExecutionActionRow>) {
  const updated = {
    ...values,
    updated_at: now()
  };
  const existing = memoryExecutions.find((entry) => entry.action_id === actionId);
  if (existing) {
    pushMemory({ ...existing, ...updated });
  }
  if (isSupabaseConfigured) await strictUpdate('execution_actions', updated, { action_id: actionId });
  else await safeUpdate('execution_actions', updated, { action_id: actionId });
}

async function expireStaleExecutionActions(before: string) {
  for (const entry of memoryExecutions) {
    if (['PENDING', 'SUBMITTED'].includes(entry.status) && new Date(entry.updated_at || entry.created_at || 0).getTime() < new Date(before).getTime()) {
      pushMemory({
        ...entry,
        status: 'UNKNOWN',
        error: 'Execution state could not be confirmed after process interruption.',
        updated_at: now()
      });
    }
  }
  if (!isSupabaseConfigured) return;
  const { error } = await supabaseService.supabase
    .from('execution_actions')
    .update({
      status: 'UNKNOWN',
      error: 'Execution state could not be confirmed after process interruption.',
      updated_at: now()
    })
    .in('status', ['PENDING', 'SUBMITTED'])
    .lt('updated_at', before);
  if (error) throw error;
}

async function listExecutionActions(limit = 100) {
  const { data, error } = await safeSelect<ExecutionActionRow>('execution_actions', (query: any) =>
    query.order('created_at', { ascending: false }).limit(limit)
  );

  if (isProduction()) {
    if (error) throw error;
    return data;
  }
  if (!error && data.length > 0) return data;
  return memoryExecutions.slice(0, limit);
}

function extractSignedMetadata(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return { payloadHash: null, signerAddress: null };
  }

  const signed = (raw as { signed?: { payloadHash?: unknown; signerAddress?: unknown; signer?: unknown } }).signed;
  return {
    payloadHash: typeof signed?.payloadHash === 'string' ? signed.payloadHash : null,
    signerAddress:
      typeof signed?.signerAddress === 'string'
        ? signed.signerAddress
        : typeof signed?.signer === 'string'
          ? signed.signer
          : null
  };
}

export = {
  createActionId,
  claimExecutionAction,
  extractSignedMetadata,
  expireStaleExecutionActions,
  findRecentExecution,
  listExecutionActions,
  recordExecutionAction,
  updateExecutionAction
};
