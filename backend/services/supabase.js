const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function isValidHttpUrl(value) {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

let isSupabaseConfigured = Boolean(isValidHttpUrl(supabaseUrl) && supabaseKey);

let client = null;

if (isSupabaseConfigured) {
  try {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  } catch (error) {
    console.warn(`[Supabase] Configuration rejected: ${error.message}`);
    isSupabaseConfigured = false;
    client = null;
  }
}

function ensureClient() {
  if (!client) {
    const error = new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.'
    );
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }

  return client;
}

const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const activeClient = ensureClient();
      const value = activeClient[prop];
      return typeof value === 'function' ? value.bind(activeClient) : value;
    }
  }
);

async function safeInsert(table, payload) {
  if (!isSupabaseConfigured) {
    console.warn(`[Supabase] Skipping insert into ${table}; client is not configured.`);
    return null;
  }

  try {
    const { data, error } = await client.from(table).insert(payload).select();
    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`[Supabase] Insert into ${table} failed: ${error.message}`);
    return null;
  }
}

async function safeUpdate(table, values, filters = {}) {
  if (!isSupabaseConfigured) {
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
    return data;
  } catch (error) {
    console.error(`[Supabase] Update on ${table} failed: ${error.message}`);
    return null;
  }
}

async function safeSelect(table, configureQuery) {
  if (!isSupabaseConfigured) {
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
    return { data, error: null };
  } catch (error) {
    console.error(`[Supabase] Select from ${table} failed: ${error.message}`);
    return { data: [], error };
  }
}

async function createAgentRun(agent) {
  const rows = await safeInsert('agent_runs', { agent, status: 'running' });
  return rows?.[0] || null;
}

async function completeAgentRun(id, values = {}) {
  if (!id) return null;
  return safeUpdate('agent_runs', { status: 'completed', ...values }, { id });
}

async function failAgentRun(id, errorMessage, values = {}) {
  if (!id) return null;
  return safeUpdate(
    'agent_runs',
    { status: 'failed', error: errorMessage, ...values },
    { id }
  );
}

module.exports = {
  supabase,
  safeInsert,
  safeSelect,
  safeUpdate,
  createAgentRun,
  completeAgentRun,
  failAgentRun,
  isSupabaseConfigured
};
