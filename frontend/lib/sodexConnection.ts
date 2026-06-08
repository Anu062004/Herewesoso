export type SodexNetwork = 'testnet' | 'mainnet';

export interface SodexConnection {
  connected: true;
  network: SodexNetwork;
  chainId: number;
  address: string;
  accountId: string | number | null;
  accountValue: number;
  availableMargin: number;
  accountError?: string | null;
  connectedAt: string;
}

const STORAGE_KEY = 'gold-grith:sodex-connection';
const CHANGE_EVENT = 'gold-grith:sodex-connection-change';

export const SODEX_APP_URLS: Record<SodexNetwork, string> = {
  testnet: 'https://testnet.sodex.com',
  mainnet: 'https://sodex.com/m/trade/futures/BTC-USD'
};

function isConnection(value: unknown): value is SodexConnection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SodexConnection>;
  return (
    candidate.connected === true &&
    (candidate.network === 'testnet' || candidate.network === 'mainnet') &&
    typeof candidate.address === 'string' &&
    typeof candidate.chainId === 'number' &&
    typeof candidate.connectedAt === 'string'
  );
}

export function getSodexConnection(): SodexConnection | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as unknown;
    return isConnection(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveSodexConnection(connection: SodexConnection) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearSodexConnection() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeSodexConnection(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);

  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function buildSodexLoginMessage(address: string, network: SodexNetwork, issuedAt: number) {
  return [
    'Gold & Grith SoDEX login',
    `Wallet: ${address.toLowerCase()}`,
    `Environment: ${network}`,
    `Issued at: ${issuedAt}`,
    '',
    'This signature proves wallet ownership. It does not authorize a trade or transfer.'
  ].join('\n');
}

export function buildSodexQuery(params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  const connection = getSodexConnection();

  if (connection) {
    query.set('network', connection.network);
    query.set('wallet', connection.address);
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  });

  const value = query.toString();
  return value ? `?${value}` : '';
}

export function shortWallet(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
