import type {
  AlertRow,
  DashboardActionResponse,
  DashboardData,
  MacroEvent,
  MemoRow,
  PositionsResponse,
  SignalRow
} from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

async function fetchJson<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      ...init
    });

    if (!response.ok) {
      return fallback;
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [signals, positions, alerts, memos, macro] = await Promise.all([
    fetchJson<SignalRow[]>('/api/signals', []),
    fetchJson<PositionsResponse>('/api/positions', { live: null, history: [] }),
    fetchJson<AlertRow[]>('/api/alerts', []),
    fetchJson<MemoRow[]>('/api/memos', []),
    fetchJson<MacroEvent[]>('/api/macro', [])
  ]);

  return { signals, positions, alerts, memos, macro };
}

export async function fetchSignals() {
  return fetchJson<SignalRow[]>('/api/signals', []);
}

export async function fetchPositions() {
  return fetchJson<PositionsResponse>('/api/positions', { live: null, history: [] });
}

export async function fetchAlerts() {
  return fetchJson<AlertRow[]>('/api/alerts', []);
}

export async function fetchMemos() {
  return fetchJson<MemoRow[]>('/api/memos', []);
}

export async function fetchMacro() {
  return fetchJson<MacroEvent[]>('/api/macro', []);
}

export async function triggerCycle() {
  return fetchJson<{ message: string }>(
    '/api/trigger',
    { message: 'Cycle trigger queued.' },
    { method: 'POST' }
  );
}

export async function queueDashboardAction(payload: {
  action: 'REDUCE_LEVERAGE' | 'CLOSE_POSITION';
  symbol: string;
  currentLeverage?: number;
  targetLeverage?: number;
}) {
  return fetchJson<DashboardActionResponse>(
    '/api/actions',
    {
      queued: false,
      action: payload.action,
      symbol: payload.symbol,
      message: 'Unable to queue action right now.'
    },
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );
}

export async function sendTelegramTest() {
  return fetchJson<{ message: string }>(
    '/api/test-telegram',
    { message: 'Unable to send Telegram test message.' },
    { method: 'POST' }
  );
}
