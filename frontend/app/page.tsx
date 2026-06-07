import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './page.module.css';

const facts = [
  { value: '30 min', label: 'orchestration cycle' },
  { value: '8', label: 'crypto sectors scored' },
  { value: 'EIP-712', label: 'signed SoDEX actions' },
  { value: 'Supabase', label: 'persistent signal memory' }
];

const operatorViews = [
  {
    href: '/dashboard/scanner',
    title: 'Narrative Scanner',
    detail: 'Sector scores built from news velocity, ETF flow, and macro pressure.',
    meta: 'SoSoValue'
  },
  {
    href: '/dashboard/shield',
    title: 'Liquidation Shield',
    detail: 'Position distance, leverage, and macro-event pressure in one risk view.',
    meta: 'SoDEX'
  },
  {
    href: '/dashboard/macro',
    title: 'Macro Calendar',
    detail: 'Upcoming releases ranked by impact and crypto sensitivity.',
    meta: 'Context'
  },
  {
    href: '/dashboard/memos',
    title: 'Trade Memos',
    detail: 'A persistent record of what the agents saw and why they escalated it.',
    meta: 'Memory'
  }
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 10h12M11 5.5l4.5 4.5-4.5 4.5" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 13h4l2.3-6 4.1 11 2.2-5H21" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 20 6v5.8c0 4.4-3.2 7.6-8 9.2-4.8-1.6-8-4.8-8-9.2V6l8-3Z" />
      <path d="m8.7 12 2.1 2.1 4.7-4.7" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
      <path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 5 2 6.5 2 6.5h-15s2-1.5 2-6.5ZM9.5 20h5" />
    </svg>
  );
}

function MapNode({
  href,
  className,
  label,
  title,
  copy,
  icon
}: {
  href: string;
  className?: string;
  label: string;
  title: string;
  copy: string;
  icon: ReactNode;
}) {
  return (
    <Link href={href} className={`${styles.mapNode} ${className || ''}`}>
      <span className={styles.nodeIcon}>{icon}</span>
      <span className={styles.nodeCopy}>
        <span className={styles.nodeLabel}>{label}</span>
        <strong>{title}</strong>
        <span>{copy}</span>
      </span>
      <span className={styles.nodeArrow}>
        <ArrowIcon />
      </span>
    </Link>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="Gold and Grith home">
          <img src="/brand/gold-and-grith-logo.svg" alt="Gold &amp; Grith" className={styles.logoImage} />
        </Link>

        <div className={styles.headerActions}>
          <span className={styles.networkStatus}>
            <span aria-hidden="true" />
            testnet connected
          </span>
          <Link href="/dashboard" className={styles.primaryAction}>
            Open terminal
            <ArrowIcon />
          </Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.orientation}>SoSoValue intelligence to SoDEX action</p>
          <h1 id="hero-title">Market context in. Risk decisions out.</h1>
          <p className={styles.heroLead}>
            Gold &amp; Grith turns news, ETF flow, macro events, and open-position risk into one operating surface for a crypto desk.
          </p>
        </div>

        <div className={styles.legend} aria-label="System map legend">
          <span><i className={styles.observeDot} />Observe</span>
          <span><i className={styles.reasonDot} />Reason</span>
          <span><i className={styles.actDot} />Act</span>
        </div>
      </section>

      <section className={styles.systemSection} aria-label="Gold and Grith system map">
        <div className={styles.systemMap}>
          <svg className={styles.mapLines} viewBox="0 0 1200 610" preserveAspectRatio="none" aria-hidden="true">
            <path className={styles.lineMuted} d="M280 150C380 150 370 174 470 174" />
            <path className={styles.lineMuted} d="M280 458C380 458 370 412 470 412" />
            <path className={styles.lineAccent} d="M600 245v56" />
            <path className={styles.lineAccent} d="M600 365v-64" />
            <path className={styles.lineMuted} d="M730 174c95 0 92-34 190-34" />
            <path className={styles.lineMuted} d="M730 290h190" />
            <path className={styles.lineMuted} d="M730 412c95 0 92 58 190 58" />
            <circle className={styles.packetOne} cx="376" cy="158" r="4" />
            <circle className={styles.packetTwo} cx="824" cy="290" r="4" />
          </svg>

          <div className={`${styles.mapColumn} ${styles.inputColumn}`}>
            <p className={styles.zoneLabel}>Observe</p>
            <MapNode
              href="/dashboard/news"
              label="Market intelligence"
              title="SoSoValue"
              copy="News, ETF flow, and macro events"
              icon={<PulseIcon />}
            />
            <MapNode
              href="/dashboard/sodex/markets"
              label="Position state"
              title="SoDEX Testnet"
              copy="Markets, leverage, and liquidation distance"
              icon={<ShieldIcon />}
            />
          </div>

          <div className={`${styles.mapColumn} ${styles.agentColumn}`}>
            <p className={styles.zoneLabel}>Reason</p>
            <MapNode
              href="/dashboard/scanner"
              className={styles.agentNode}
              label="Agent one"
              title="Narrative Alpha Scanner"
              copy="Scores sector momentum against live market context"
              icon={<PulseIcon />}
            />

            <div className={styles.orchestrator}>
              <span className={styles.orchestratorPulse} aria-hidden="true" />
              <span>
                <strong>Sentinel cycle</strong>
                <small>orchestrates every 30 minutes</small>
              </span>
            </div>

            <MapNode
              href="/dashboard/shield"
              className={styles.agentNode}
              label="Agent two"
              title="Liquidation Shield"
              copy="Escalates position risk and prepares guarded actions"
              icon={<ShieldIcon />}
            />
          </div>

          <div className={`${styles.mapColumn} ${styles.outputColumn}`}>
            <p className={styles.zoneLabel}>Act and remember</p>
            <MapNode
              href="/dashboard"
              label="Operator surface"
              title="Dashboard"
              copy="Signals, risk, macro, and execution controls"
              icon={<PulseIcon />}
            />
            <MapNode
              href="/dashboard/memos"
              label="Persistent memory"
              title="Supabase"
              copy="Signals, alerts, agent runs, and trade memos"
              icon={<DatabaseIcon />}
            />
            <MapNode
              href="/dashboard/telegram"
              label="Priority routing"
              title="Telegram"
              copy="Critical alerts where the operator already works"
              icon={<BellIcon />}
            />
          </div>
        </div>

        <div className={styles.mapCta}>
          <p>Every node maps to a working module in the terminal.</p>
          <Link href="/dashboard" className={styles.secondaryAction}>
            Explore the live system
            <ArrowIcon />
          </Link>
        </div>
      </section>

      <section className={styles.factRail} aria-label="Product facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <strong>{fact.value}</strong>
            <span>{fact.label}</span>
          </div>
        ))}
      </section>

      <section className={styles.agents} aria-labelledby="agents-title">
        <div className={styles.sectionIntro}>
          <h2 id="agents-title">Two agents. One continuous risk picture.</h2>
          <p>
            The scanner looks for opportunity while the shield watches what is already exposed. They share market context, memory, and alerting.
          </p>
        </div>

        <div className={styles.agentDetails}>
          <article>
            <div className={styles.agentHeading}>
              <PulseIcon />
              <h3>Narrative Alpha Scanner</h3>
            </div>
            <p>
              Scores DeFi, AI, RWA, L1, L2, GameFi, DePIN, and Meme sectors using SoSoValue news, ETF flow, and macro inputs.
            </p>
            <dl>
              <div><dt>Reads</dt><dd>news velocity · ETF flow · macro pressure</dd></div>
              <div><dt>Writes</dt><dd>sector scores · signals · AI trade memos</dd></div>
            </dl>
            <Link href="/dashboard/scanner">Inspect scanner <ArrowIcon /></Link>
          </article>

          <article>
            <div className={styles.agentHeading}>
              <ShieldIcon />
              <h3>Liquidation Shield</h3>
            </div>
            <p>
              Reads SoDEX positions, calculates liquidation distance and leverage risk, then escalates when the desk needs attention.
            </p>
            <dl>
              <div><dt>Reads</dt><dd>mark price · leverage · liquidation distance</dd></div>
              <div><dt>Prepares</dt><dd>risk alerts · reduce-only signed actions</dd></div>
            </dl>
            <Link href="/dashboard/shield">Inspect shield <ArrowIcon /></Link>
          </article>
        </div>
      </section>

      <section className={styles.operatorSection} aria-labelledby="operator-title">
        <div className={styles.operatorHeading}>
          <h2 id="operator-title">The dashboard is the operating surface.</h2>
          <p>No disconnected reports. Each view is part of the same monitored cycle.</p>
        </div>

        <div className={styles.operatorIndex}>
          {operatorViews.map((view) => (
            <Link href={view.href} key={view.title}>
              <span className={styles.operatorMeta}>{view.meta}</span>
              <span className={styles.operatorTitle}>{view.title}</span>
              <span className={styles.operatorDetail}>{view.detail}</span>
              <span className={styles.operatorArrow}><ArrowIcon /></span>
            </Link>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p>The market will not wait for another tab to load.</p>
        <div className={styles.footerMeta}>
          <span>Gold &amp; Grith · SoSo-native crypto intelligence</span>
          <Link href="/dashboard">
            Enter terminal
            <ArrowIcon />
          </Link>
        </div>
      </footer>
    </main>
  );
}
