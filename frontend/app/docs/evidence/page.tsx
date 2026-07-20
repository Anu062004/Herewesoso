import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { backendBaseUrl } from '@/lib/backendConfig';

import styles from './evidence.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Delivery Evidence | Gold & Grith',
  description: 'Runtime, release, test, and on-chain evidence for Gold & Grith Wave 3 capabilities.'
};

type DeliveryStatus = 'LIVE' | 'TESTNET' | 'REPOSITORY_ONLY';

interface EvidenceLink {
  label: string;
  href: string;
  kind: 'source' | 'test' | 'route' | 'contract' | 'transaction' | 'release';
  verified?: boolean;
}

interface FeatureEvidence {
  id: string;
  name: string;
  status: DeliveryStatus;
  summary: string;
  boundary: string;
  links: EvidenceLink[];
  metrics: Record<string, string | number | boolean | null>;
}

interface DeliveryEvidence {
  generatedAt: string;
  release: {
    repositoryUrl: string;
    commitSha: string | null;
    commitUrl: string | null;
    demoUrl: string | null;
    environment: 'production' | 'development';
  };
  checks: {
    persistenceConfigured: boolean;
    persistenceReachable: boolean;
    production: boolean;
  };
  summary: {
    live: number;
    testnet: number;
    repositoryOnly: number;
    total: number;
  };
  features: FeatureEvidence[];
}

const repositoryUrl = 'https://github.com/Anu062004/Herewesoso';
const productRoutes: Record<string, { href: string; label: string }> = {
  siwe: { href: '/dashboard/sodex/connect', label: 'Open wallet connection' },
  shield: { href: '/dashboard/shield', label: 'Open Liquidation Shield' },
  marketplace: { href: '/dashboard/strategies', label: 'Open Marketplace' },
  automation: { href: '/dashboard/automation', label: 'Open automation' }
};

const fallbackEvidence: DeliveryEvidence = {
  generatedAt: new Date(0).toISOString(),
  release: { repositoryUrl, commitSha: null, commitUrl: null, demoUrl: null, environment: 'development' },
  checks: { persistenceConfigured: false, persistenceReachable: false, production: false },
  summary: { live: 0, testnet: 0, repositoryOnly: 4, total: 4 },
  features: [
    ['siwe', 'SIWE multi-user sessions'],
    ['shield', 'SoDEX Liquidation Shield'],
    ['marketplace', 'Strategy Marketplace'],
    ['automation', 'On-chain auto-execution']
  ].map(([id, name]) => ({
    id,
    name,
    status: 'REPOSITORY_ONLY' as const,
    summary: 'Source and tests are available for review.',
    boundary: 'The evidence API is unavailable, so this page will not infer a live deployment.',
    links: [{ label: 'Repository', href: repositoryUrl, kind: 'source' as const }],
    metrics: {}
  }))
};

const statusCopy: Record<DeliveryStatus, { symbol: string; label: string }> = {
  LIVE: { symbol: '●', label: 'Live' },
  TESTNET: { symbol: '◇', label: 'Testnet' },
  REPOSITORY_ONLY: { symbol: '—', label: 'Repository only' }
};

async function loadEvidence(): Promise<{ data: DeliveryEvidence; reachable: boolean }> {
  try {
    const response = await fetch(`${backendBaseUrl()}/api/evidence`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Evidence API returned ${response.status}.`);
    return { data: await response.json() as DeliveryEvidence, reachable: true };
  } catch {
    return { data: fallbackEvidence, reachable: false };
  }
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

function statusClass(status: DeliveryStatus) {
  if (status === 'LIVE') return styles.statusLive;
  if (status === 'TESTNET') return styles.statusTestnet;
  return styles.statusRepository;
}

function visibleMetric([, value]: [string, string | number | boolean | null]) {
  return value !== null && value !== '';
}

function metricValue(value: string | number | boolean | null) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value ?? 'not supplied');
}

function humanMetric(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

export default async function EvidencePage() {
  const { data, reachable } = await loadEvidence();
  const evidenced = data.summary.live + data.summary.testnet;
  const releaseLabel = data.release.commitSha ? data.release.commitSha.slice(0, 9) : 'not identified';

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <Link className={styles.brand} href="/" aria-label="Gold and Grith home">
            <Image src="/brand/gold-and-grith-mark.svg" alt="" width={32} height={32} priority />
            <span>Gold <em>&amp;</em> Grith</span>
          </Link>
          <p>Delivery evidence / Wave 3</p>
          <Link className={styles.headerCta} href="/dashboard">Open terminal <ArrowIcon /></Link>
        </div>
      </header>

      <section className={`${styles.shell} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Claims stop where evidence stops.</p>
          <h1><span>{evidenced}/{data.summary.total}</span> capabilities carry runtime or chain evidence.</h1>
          <p>
            Every Wave 3 claim below is classified from the running backend. Source code alone stays marked repository only; testnet proof never becomes a mainnet claim.
          </p>
        </div>
        <dl className={styles.heroStats}>
          <div><dt>Live</dt><dd>{data.summary.live}</dd></div>
          <div><dt>Testnet</dt><dd>{data.summary.testnet}</dd></div>
          <div><dt>Repository only</dt><dd>{data.summary.repositoryOnly}</dd></div>
        </dl>
        {!reachable ? (
          <div className={styles.apiWarning} role="status">
            <strong>Evidence API unavailable</strong>
            <span>No live status is inferred. The table is showing its conservative fallback.</span>
          </div>
        ) : null}
      </section>

      <section className={`${styles.shell} ${styles.ledger}`} aria-labelledby="ledger-title">
        <div className={styles.sectionLead}>
          <p>01 / Feature ledger</p>
          <h2 id="ledger-title">One status. One proof boundary.</h2>
        </div>
        <div className={styles.tableHeader} aria-hidden="true">
          <span>Capability</span><span>Status</span><span>What is proven</span><span>Evidence</span>
        </div>
        <div className={styles.featureList}>
          {data.features.map((feature, index) => (
            <article className={styles.featureRow} key={feature.id}>
              <div className={styles.featureName}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{feature.name}</h3>
                <p>{feature.summary}</p>
              </div>
              <div>
                <span className={`${styles.status} ${statusClass(feature.status)}`}>
                  <span aria-hidden="true">{statusCopy[feature.status].symbol}</span> {statusCopy[feature.status].label}
                </span>
              </div>
              <div className={styles.proofBoundary}>
                <p>{feature.boundary}</p>
                <dl>
                  {Object.entries(feature.metrics).filter(visibleMetric).slice(0, 6).map(([key, value]) => (
                    <div key={key}><dt>{humanMetric(key)}</dt><dd>{metricValue(value)}</dd></div>
                  ))}
                </dl>
              </div>
              <div className={styles.evidenceLinks}>
                {productRoutes[feature.id] ? (
                  <Link href={productRoutes[feature.id].href}>
                    <span>{productRoutes[feature.id].label}</span><ArrowIcon />
                  </Link>
                ) : null}
                {feature.links.map((link) => (
                  <a href={link.href} key={`${feature.id}-${link.label}`} target="_blank" rel="noreferrer">
                    <span>{link.label}{link.kind === 'transaction' ? ` · ${link.verified ? 'verified' : 'unverified'}` : ''}</span>
                    <ArrowIcon />
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.shell} ${styles.audit}`} aria-labelledby="audit-title">
        <div className={styles.sectionLead}>
          <p>02 / Reproduce</p>
          <h2 id="audit-title">A reviewer can verify the boundary.</h2>
        </div>
        <div className={styles.auditGrid}>
          <article>
            <span>Authentication</span>
            <h3>Prove wallet isolation</h3>
            <ol>
              <li>Request a domain-bound challenge for wallet A.</li>
              <li>Sign it, verify its HttpOnly session, then repeat for wallet B.</li>
              <li>Disconnect A; B must remain authenticated and isolated.</li>
            </ol>
          </article>
          <article>
            <span>Marketplace</span>
            <h3>Prove durable ownership</h3>
            <ol>
              <li>Publish a draft and record its SHA-256 version hash.</li>
              <li>Install it with another SIWE wallet.</li>
              <li>Confirm the publisher cannot read or mutate that wallet’s installation.</li>
            </ol>
          </article>
          <article>
            <span>Automation</span>
            <h3>Prove an execution path</h3>
            <ol>
              <li>Verify executor, adapter, and checker bytecode.</li>
              <li>Match approval and rule-creation events to those contracts.</li>
              <li>Match a RuleExecuted event to the same on-chain rule ID.</li>
            </ol>
          </article>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.release}`} aria-labelledby="release-title">
        <div className={styles.releaseHeading}>
          <p>03 / Release identity</p>
          <h2 id="release-title">Inspect exactly what is deployed.</h2>
        </div>
        <dl>
          <div><dt>Environment</dt><dd>{data.release.environment}</dd></div>
          <div><dt>Commit</dt><dd>{releaseLabel}</dd></div>
          <div><dt>Evidence generated</dt><dd>{reachable ? new Date(data.generatedAt).toLocaleString('en-GB', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }) + ' UTC' : 'backend unavailable'}</dd></div>
          <div><dt>Persistence</dt><dd>{data.checks.persistenceReachable ? 'reachable' : data.checks.persistenceConfigured ? 'configured, not reachable' : 'not configured'}</dd></div>
        </dl>
        <div className={styles.releaseLinks}>
          {data.release.commitUrl ? <a href={data.release.commitUrl} target="_blank" rel="noreferrer">Inspect deployed commit <ArrowIcon /></a> : null}
          {data.release.demoUrl ? <a href={data.release.demoUrl} target="_blank" rel="noreferrer">Open public demo <ArrowIcon /></a> : null}
          <a href={data.release.repositoryUrl} target="_blank" rel="noreferrer">Open repository <ArrowIcon /></a>
          <Link href="/docs">Read product docs <ArrowIcon /></Link>
        </div>
      </section>

      <footer className={`${styles.shell} ${styles.footer}`}>
        <div><strong>Gold &amp; Grith</strong><span>Claims stop where evidence stops.</span></div>
        <nav aria-label="Evidence footer navigation">
          <Link href="/">Landing</Link><Link href="/docs">Docs</Link><Link href="/dashboard">Terminal</Link>
        </nav>
      </footer>
    </main>
  );
}
