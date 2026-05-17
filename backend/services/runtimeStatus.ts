interface RuntimeAgentRun {
  id?: string | number;
  agent: string;
  status: string;
  created_at: string;
  duration_ms?: number | null;
  error?: string | null;
  summary?: Record<string, unknown> | null;
}

let lastTelegramMessageAt: string | null = null;
let lastAgentRun: RuntimeAgentRun | null = null;

function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function recordTelegramMessage(timestamp = new Date().toISOString()) {
  lastTelegramMessageAt = timestamp;
}

export function getTelegramRuntimeStatus() {
  const configured = isTelegramConfigured();

  return {
    configured,
    connected: configured,
    lastMessageSentAt: lastTelegramMessageAt
  };
}

export function recordAgentRun(run: RuntimeAgentRun) {
  lastAgentRun = {
    ...run,
    summary: run.summary || null,
    error: run.error || null,
    duration_ms: typeof run.duration_ms === 'number' ? run.duration_ms : null
  };
}

export function updateAgentRun(values: Partial<RuntimeAgentRun>) {
  if (!lastAgentRun) {
    lastAgentRun = {
      agent: 'orchestrator',
      status: values.status || 'unknown',
      created_at: values.created_at || new Date().toISOString(),
      id: values.id,
      duration_ms: typeof values.duration_ms === 'number' ? values.duration_ms : null,
      error: values.error || null,
      summary: (values.summary as Record<string, unknown> | null | undefined) || null
    };
    return;
  }

  lastAgentRun = {
    ...lastAgentRun,
    ...values,
    summary:
      (values.summary as Record<string, unknown> | null | undefined) ?? lastAgentRun.summary ?? null,
    error: values.error ?? lastAgentRun.error ?? null
  };
}

export function getLastAgentRun() {
  return lastAgentRun;
}
