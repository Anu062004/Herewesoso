import crypto from 'crypto';

import type { ExecutionActionRow } from '../types/domain';

import supabaseService = require('./supabase');

const { safeInsert, safeSelect, safeUpdate } = supabaseService;

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

async function updateExecutionAction(actionId: string, values: Partial<ExecutionActionRow>) {
  const updated = {
    ...values,
    updated_at: now()
  };
  const existing = memoryExecutions.find((entry) => entry.action_id === actionId);
  if (existing) {
    pushMemory({ ...existing, ...updated });
  }
  await safeUpdate('execution_actions', updated, { action_id: actionId });
}

async function listExecutionActions(limit = 100) {
  const { data, error } = await safeSelect<ExecutionActionRow>('execution_actions', (query: any) =>
    query.order('created_at', { ascending: false }).limit(limit)
  );

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
  extractSignedMetadata,
  listExecutionActions,
  recordExecutionAction,
  updateExecutionAction
};
