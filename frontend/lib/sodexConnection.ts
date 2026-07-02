export type SodexNetwork = 'testnet' | 'mainnet';

export interface SodexNetworkConfig {
  id: SodexNetwork;
  label: string;
  chainId: number;
  chainIdHex: `0x${string}`;
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

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

export const SODEX_NETWORK_CONFIG: Record<SodexNetwork, SodexNetworkConfig> = {
  testnet: {
    id: 'testnet',
    label: 'ValueChain Testnet',
    chainId: 138565,
    chainIdHex: '0x21d45',
    chainName: 'ValueChain Testnet',
    rpcUrls: ['https://testnet-v2.valuechain.xyz'],
    blockExplorerUrls: ['https://test-scan.valuechain.xyz'],
    nativeCurrency: {
      name: 'SOSO',
      symbol: 'SOSO',
      decimals: 18
    }
  },
  mainnet: {
    id: 'mainnet',
    label: 'ValueChain',
    chainId: 286623,
    chainIdHex: '0x45f9f',
    chainName: 'ValueChain',
    rpcUrls: ['https://mainnet.valuechain.xyz'],
    blockExplorerUrls: ['https://main-scan.valuechain.xyz'],
    nativeCurrency: {
      name: 'SOSO',
      symbol: 'SOSO',
      decimals: 18
    }
  }
};

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
