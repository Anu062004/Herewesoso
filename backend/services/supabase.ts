import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import errorUtils = require('../utils/error');

// Polyfill WebSocket for Node.js < 22 before any supabase-js initialisation
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ws = require('ws') as typeof import('ws');
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = ws;
}

const { getErrorMessage } = errorUtils;

type QueryConfigurator = (query: any) => any;
type FilterValue = string | number | boolean | null;
type RowObject = object;
type AgentRunRecord = { id?: string | number } & Record<string, unknown>;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

class SupabaseConfigurationError extends Error {
  code = 'SUPABASE_NOT_CONFIGURED' as const;

  constructor() {
    super(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.'
    );
    this.name = 'SupabaseConfigurationError';
  }
}

let isSupabaseConfigured = Boolean(isValidHttpUrl(supabaseUrl) && supabaseKey);

let client: SupabaseClient | null = null;

if (isSupabaseConfigured && supabaseUrl && supabaseKey) {
  try {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  } catch (error) {
    console.warn(`[Supabase] Configuration rejected: ${getErrorMessage(error)}`);
    isSupabaseConfigured = false;
    client = null;
  }
}

function ensureClient(): SupabaseClient {
  if (!client) {
    throw new SupabaseConfigurationError();
  }

  return client;
}

const supabase = new Proxy(
  {} as SupabaseClient,
  {
    get(_target, prop) {
      const activeClient = ensureClient();
      const key = prop as keyof SupabaseClient;
      const value = activeClient[key];
      return typeof value === 'function' ? value.bind(activeClient) : value;
    }
  }
);

async function safeInsert<T extends RowObject>(
  table: string,
  payload: T | T[]
): Promise<Record<string, unknown>[] | null> {
  if (!isSupabaseConfigured || !client) {
    console.warn(`[Supabase] Skipping insert into ${table}; client is not configured.`);
    return null;
  }

  try {
    const { data, error } = await client.from(table).insert(payload).select();
    if (error) throw error;
    return (data as Record<string, unknown>[]) || null;
  } catch (error) {
    console.error(`[Supabase] Insert into ${table} failed: ${getErrorMessage(error)}`);
    return null;
  }
}

async function safeUpdate(
  table: string,
  values: RowObject,
  filters: Record<string, FilterValue> = {}
): Promise<Record<string, unknown>[] | null> {
  if (!isSupabaseConfigured || !client) {
    console.warn(`[Supabase] Skipping update on ${table}; client is not configured.`);
    return null;
  }

  try {
    let query = client.from(table).update(values);

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query.select();
    if (error) throw error;
    return (data as Record<string, unknown>[]) || null;
  } catch (error) {
    console.error(`[Supabase] Update on ${table} failed: ${getErrorMessage(error)}`);
    return null;
  }
}

async function safeSelect<T = Record<string, unknown>>(
  table: string,
  configureQuery?: QueryConfigurator
): Promise<{ data: T[]; error: Error | null }> {
  if (!isSupabaseConfigured || !client) {
    return { data: [], error: null };
  }

  try {
    let query = client.from(table).select('*');
    if (typeof configureQuery === 'function') {
      const configured = configureQuery(query);
      if (configured) query = configured;
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data: ((data as T[]) || []), error: null };
  } catch (error) {
    const message = getErrorMessage(error);
    console.error(`[Supabase] Select from ${table} failed: ${message}`);
    return { data: [], error: new Error(message) };
  }
}

async function createAgentRun(agent: string): Promise<AgentRunRecord | null> {
  const rows = await safeInsert('agent_runs', { agent, status: 'running' });
  return (rows?.[0] as AgentRunRecord | undefined) || null;
}

async function completeAgentRun(id: string | number | undefined, values: RowObject = {}) {
  if (!id) return null;
  return safeUpdate('agent_runs', { status: 'completed', ...values }, { id });
}

async function failAgentRun(
  id: string | number | undefined,
  errorMessage: string,
  values: RowObject = {}
) {
  if (!id) return null;
  return safeUpdate('agent_runs', { status: 'failed', error: errorMessage, ...values }, { id });
}

export = {
  supabase,
  safeInsert,
  safeSelect,
  safeUpdate,
  createAgentRun,
  completeAgentRun,
  failAgentRun,
  isSupabaseConfigured
};
