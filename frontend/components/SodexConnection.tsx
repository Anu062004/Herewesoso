'use client';

import { useEffect, useState } from 'react';

import { connectSodex, disconnectSodex, fetchSodexLoginChallenge, fetchSodexSession } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import {
  clearSodexConnection,
  saveSodexConnection,
  shortWallet,
  SODEX_NETWORK_CONFIG,
  SODEX_APP_URLS
} from '@/lib/sodexConnection';
import type { SodexNetwork } from '@/lib/sodexConnection';
import { useSodexConnection } from '@/lib/useSodexConnection';

import { AlertTriangleIcon, CheckIcon, ShieldIcon, WorldIcon } from '@/components/terminal/icons';
import { Button, cx, Panel, PanelHeader, Pill } from '@/components/terminal/ui';

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
  removeListener?(event: 'accountsChanged', listener: (accounts: string[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

type ConnectState = 'idle' | 'wallet' | 'signature' | 'verification' | 'success' | 'error';

const NETWORKS: Array<{
  id: SodexNetwork;
  label: string;
  eyebrow: string;
  chainId: number;
  description: string;
}> = [
  {
    id: 'testnet',
    label: 'Testnet',
    eyebrow: 'Practice environment',
    chainId: SODEX_NETWORK_CONFIG.testnet.chainId,
    description: 'Use test funds to verify the full setup before working with real value.'
  },
  {
    id: 'mainnet',
    label: 'Mainnet',
    eyebrow: 'Live environment',
    chainId: SODEX_NETWORK_CONFIG.mainnet.chainId,
    description: 'Read your live account and approve supported actions directly in your connected wallet.'
  }
];

function isWalletError(error: unknown): error is { code?: number | string; message?: string } {
  return Boolean(error && typeof error === 'object');
}

function messageToHex(message: string) {
  return `0x${Array.from(new TextEncoder().encode(message))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}

function stateLabel(state: ConnectState) {
  if (state === 'wallet') return 'Waiting for wallet';
  if (state === 'signature') return 'Waiting for signature';
  if (state === 'verification') return 'Verifying account';
  if (state === 'success') return 'Connected';
  if (state === 'error') return 'Needs attention';
  return 'Ready to connect';
}

function isUnknownChainError(error: unknown) {
  if (!isWalletError(error)) {
    return false;
  }

  return error.code === 4902 || /unrecognized chain|unknown chain|not added/i.test(error.message || '');
}

function isUserRejected(error: unknown) {
  if (!isWalletError(error)) {
    return false;
  }

  return error.code === 4001 || /user rejected|user denied|rejected the request/i.test(error.message || '');
}

async function ensureWalletNetwork(provider: EthereumProvider, network: SodexNetwork) {
  const config = SODEX_NETWORK_CONFIG[network];

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.chainIdHex }]
    });
  } catch (switchError) {
    if (isUserRejected(switchError)) {
      throw new Error(`Switch to ${config.label} was rejected in the wallet.`);
    }

    if (!isUnknownChainError(switchError)) {
      throw switchError;
    }

    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: config.chainIdHex,
        chainName: config.chainName,
        nativeCurrency: config.nativeCurrency,
        rpcUrls: config.rpcUrls,
        blockExplorerUrls: config.blockExplorerUrls
      }]
    });
  }

  const activeChainId = await provider.request({ method: 'eth_chainId' });

  if (typeof activeChainId === 'string' && activeChainId.toLowerCase() !== config.chainIdHex) {
    throw new Error(`Wallet is still on chain ${activeChainId}. Switch to ${config.label} (${config.chainId}) and try again.`);
  }
}

export default function SodexConnection() {
  const connection = useSodexConnection();
  const [network, setNetwork] = useState<SodexNetwork>('testnet');
  const [state, setState] = useState<ConnectState>('idle');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchSodexSession()
      .then((session) => {
        if (!active) return;
        saveSodexConnection(session);
        setNetwork(session.network);
        setState('success');
      })
      .catch(() => {
        if (!active) return;
        clearSodexConnection();
        setState('idle');
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (connection) {
      setNetwork(connection.network);
      setState('success');
    }
  }, [connection]);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) {
      return;
    }

    const handleAccountsChanged = (accounts: string[]) => {
      if (connection && accounts[0]?.toLowerCase() !== connection.address.toLowerCase()) {
        void disconnectSodex().catch(() => undefined);
        clearSodexConnection();
        setState('idle');
        setMessage('The active wallet changed. Sign in again to refresh the SoDEX connection.');
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);
    return () => provider.removeListener?.('accountsChanged', handleAccountsChanged);
  }, [connection]);

  async function handleConnect() {
    const provider = window.ethereum;

    if (!provider) {
      setState('error');
      setMessage('No browser wallet was detected. Install or unlock an EVM wallet, then try again.');
      return;
    }

    try {
      setMessage('');
      setState('wallet');
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts[0];

      if (!address) {
        throw new Error('The wallet did not return an account.');
      }

      setMessage(`Switching wallet to ${SODEX_NETWORK_CONFIG[network].label}...`);
      await ensureWalletNetwork(provider, network);

      setMessage('Preparing secure SoDEX login challenge...');
      const loginChallenge = await fetchSodexLoginChallenge(network, address);

      setState('signature');
      const signature = (await provider.request({
        method: 'personal_sign',
        params: [messageToHex(loginChallenge.message), address]
      })) as string;

      setState('verification');
      const result = await connectSodex({
        network,
        address,
        signature,
        challengeId: loginChallenge.challengeId
      });

      saveSodexConnection(result);
      setState('success');
      setMessage(
        result.accountError
          ? 'Wallet verified. Open the official SoDEX app to create or enable the trading account.'
          : `${network === 'mainnet' ? 'Mainnet' : 'Testnet'} account verified and loaded.`
      );
      const requestedPath = new URLSearchParams(window.location.search).get('next');
      window.location.assign(requestedPath?.startsWith('/dashboard') ? requestedPath : '/dashboard');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'The SoDEX connection could not be completed.');
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectSodex();
    } catch {
      // Clear the local display even if the expired server cookie is already gone.
    }
    clearSodexConnection();
    setState('idle');
    setMessage('Dashboard connection removed. Your wallet remains unchanged.');
  }

  async function handleCopy() {
    if (!connection) return;
    await navigator.clipboard.writeText(connection.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const busy = state === 'wallet' || state === 'signature' || state === 'verification';
  const selected = NETWORKS.find((item) => item.id === network) || NETWORKS[0];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.8fr)]">
      <Panel>
        <PanelHeader
          title="Connect environment"
          subtitle="Select where the dashboard should read SoDEX account and market data."
          accent="cyan"
          right={<Pill tone={connection ? 'green' : 'gray'}>{connection ? 'Wallet verified' : stateLabel(state)}</Pill>}
        />

        <div className="space-y-6 p-5 sm:p-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]">1. Choose network</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {NETWORKS.map((item) => {
                const active = network === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setNetwork(item.id);
                      setState('idle');
                      setMessage(connection && connection.network !== item.id ? 'Sign again to switch environments.' : '');
                    }}
                    className={cx(
                      'rounded-[var(--radius-lg)] border p-4 text-left transition-[border-color,background,transform] duration-[var(--dur-short)] disabled:cursor-not-allowed disabled:opacity-60',
                      active
                        ? 'border-[rgba(255,107,0,0.62)] bg-[rgba(255,107,0,0.08)]'
                        : 'border-[var(--border)] bg-[var(--bg-panel)] hover:-translate-y-px hover:border-[var(--border-hover)]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] text-[var(--text-3)]">{item.eyebrow}</div>
                        <div className="mt-1 font-headline text-[19px] font-semibold text-[var(--text-1)]">{item.label}</div>
                      </div>
                      <span
                        className={cx(
                          'mt-1 flex h-5 w-5 items-center justify-center rounded-full border',
                          active ? 'border-[var(--brand)] bg-[var(--brand)] text-black' : 'border-[var(--border-hover)]'
                        )}
                      >
                        {active ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                      </span>
                    </div>
                    <p className="mt-3 text-[12px] leading-5 text-[var(--text-2)]">{item.description}</p>
                    <div className="mt-4 font-mono text-[11px] text-[var(--text-3)]">Chain ID {item.chainId}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[var(--border)] pt-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]">2. Prove wallet ownership</div>
            <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-panel)] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[14px] font-medium text-[var(--text-1)]">
                    {connection && connection.network === network
                      ? shortWallet(connection.address)
                      : `Connect to SoDEX ${selected.label}`}
                  </div>
                  <p className="mt-1 max-w-xl text-[12px] leading-5 text-[var(--text-2)]">
                    Your wallet signs a readable login message. This signature cannot move funds, place an order, or approve a token.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {connection && connection.network === network ? (
                    <>
                      <Button onClick={() => void handleCopy()}>{copied ? 'Copied' : 'Copy address'}</Button>
                      <Button onClick={() => void handleDisconnect()}>Disconnect</Button>
                    </>
                  ) : (
                    <Button tone="primary" disabled={busy} onClick={() => void handleConnect()}>
                      {busy ? stateLabel(state) : 'Connect wallet'}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {message ? (
              <div
                className={cx(
                  'mt-3 flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-[12px] leading-5',
                  state === 'error'
                    ? 'border-[rgba(220,38,38,0.28)] bg-[rgba(220,38,38,0.08)] text-[var(--red)]'
                    : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-2)]'
                )}
              >
                {state === 'error' ? <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" />}
                <span>{message}</span>
              </div>
            ) : null}

            {!connection ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-3)]">
                <span>Don&apos;t have a SoDEX account?</span>
                <a
                  href={SODEX_APP_URLS[network]}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[var(--brand)] transition hover:brightness-125"
                >
                  Create one on SoDEX
                </a>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--border)] pt-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-3)]">3. Enable trading on SoDEX</div>
            <div className="mt-3 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-panel)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[14px] font-medium text-[var(--text-1)]">Finish in the official {selected.label} app</div>
                <p className="mt-1 max-w-xl text-[12px] leading-5 text-[var(--text-2)]">
                  Connect the same wallet there and select Enable Trading. SoDEX may request its own gasless wallet signature.
                </p>
              </div>
              <a
                href={SODEX_APP_URLS[network]}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 text-[13px] font-medium text-[var(--text-1)] transition hover:border-[var(--border-hover)]"
              >
                Open official SoDEX
              </a>
            </div>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Connection summary" accent="amber" />
          <div className="p-5">
            {connection ? (
              <dl className="space-y-4 text-[12px]">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--text-3)]">Environment</dt>
                  <dd><Pill tone={connection.network === 'mainnet' ? 'amber' : 'cyan'}>{connection.network === 'mainnet' ? 'Mainnet' : 'Testnet'}</Pill></dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--text-3)]">Wallet</dt>
                  <dd className="font-mono text-[var(--text-1)]">{shortWallet(connection.address)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--text-3)]">Account ID</dt>
                  <dd className="text-[var(--text-1)]">{connection.accountId ?? 'Not created'}</dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-[var(--text-3)]">Account value</dt>
                  <dd className="font-medium tabular-nums text-[var(--text-1)]">{formatPrice(connection.accountValue)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-4">
                  <dt className="text-[var(--text-3)]">Available margin</dt>
                  <dd className="font-medium tabular-nums text-[var(--green)]">{formatPrice(connection.availableMargin)}</dd>
                </div>
              </dl>
            ) : (
              <div className="py-4 text-center">
                <WorldIcon className="mx-auto h-7 w-7 text-[var(--text-3)]" />
                <div className="mt-3 text-[14px] font-medium text-[var(--text-1)]">No wallet connected</div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--text-3)]">Choose an environment and sign the login message to load the account.</p>
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="p-5">
            <div className="flex items-start gap-3">
              <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--green)]" />
              <div>
                <div className="text-[13px] font-semibold text-[var(--text-1)]">Security boundary</div>
                <p className="mt-2 text-[12px] leading-5 text-[var(--text-2)]">
                  Trade actions require an explicit EIP-712 approval from the connected wallet. Private keys are never entered here or sent to the backend.
                </p>
              </div>
            </div>
          </div>
        </Panel>

        {connection ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href="/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-[13px] font-semibold text-black transition hover:brightness-110"
            >
              Open Dashboard
            </a>
            <a
              href="/dashboard/scanner"
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 text-[13px] font-semibold text-[var(--text-1)] transition hover:border-[var(--border-hover)]"
            >
              Open Narrative Scanner
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
