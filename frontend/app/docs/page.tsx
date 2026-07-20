import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import styles from './docs.module.css';

export const metadata: Metadata = {
  title: 'Documentation | Gold & Grith',
  description: 'Connect Gold & Grith, configure Telegram, and use Narrative Scanner, technical graph analysis, Shield, strategies, and automation.'
};

const sections = [
  ['start', 'Start here'],
  ['wallet', 'Connect wallet'],
  ['telegram', 'Connect Telegram'],
  ['scanner', 'Narrative Scanner'],
  ['graph', 'Graph analysis'],
  ['features', 'Feature guide'],
  ['security', 'Security model'],
  ['troubleshooting', 'Troubleshooting']
] as const;

const botCommands = [
  ['/positions', 'View the monitored account’s open positions.'],
  ['/risk', 'Show the current Shield risk overview and scores.'],
  ['/signals', 'Read the latest sector and narrative signals.'],
  ['/news', 'Fetch the latest crypto news feed.'],
  ['/macro', 'Show high-impact macro events.'],
  ['/summary', 'Read recent AI market briefs.'],
  ['/status', 'Check backend, wallet, key, network, and alert status.'],
  ['/keyinfo', 'Inspect signing-key configuration status without exposing the key.'],
  ['/menu', 'Open the bot’s main command menu.']
] as const;

const featureGuide = [
  {
    index: '01',
    title: 'Market workspace',
    route: '/dashboard/sodex/markets',
    routeLabel: 'Open markets',
    copy: 'Inspect SoDEX market metadata, mark prices, order-book depth, and selectable candlestick intervals before opening an analysis view.',
    details: ['Markets and mark prices', 'Order book and depth', '1m through 1d candle intervals']
  },
  {
    index: '02',
    title: 'Narrative Scanner',
    route: '/dashboard/scanner',
    routeLabel: 'Open scanner',
    copy: 'Rank eight crypto sectors by attention, confirmation, lifecycle, confidence, and crowding while retaining the evidence behind each score.',
    details: ['Lifecycle and opportunity ranking', 'ETF and macro context', 'Wallet-specific alert preferences']
  },
  {
    index: '03',
    title: 'Technical graph analysis',
    route: '/dashboard/sodex/klines',
    routeLabel: 'Analyse a chart',
    copy: 'Turn SoDEX OHLCV candles into a deterministic market-structure narrative with indicators, levels, conflicts, and an invalidation condition.',
    details: ['Trend, momentum, volatility, and volume', 'Support, resistance, and breakout state', 'Evidence agreement confidence']
  },
  {
    index: '04',
    title: 'Liquidation Shield',
    route: '/dashboard/shield',
    routeLabel: 'Open Shield',
    copy: 'Evaluate liquidation proximity, margin health, volatility, liquidity, funding crowding, and market threats for monitored positions.',
    details: ['SAFE through CRITICAL risk levels', 'Position and portfolio pressure', 'Rescue estimates and alert evidence']
  },
  {
    index: '05',
    title: 'Strategy Marketplace',
    route: '/dashboard/strategies',
    routeLabel: 'Browse strategies',
    copy: 'Create drafts, publish immutable strategy versions, install them per wallet, review them, and separate claims from verified performance evidence.',
    details: ['Draft and published versions', 'Wallet-scoped installations', 'Reviews and performance evidence']
  },
  {
    index: '06',
    title: 'On-chain automation',
    route: '/dashboard/automation',
    routeLabel: 'View automation',
    copy: 'Prepare non-custodial rules with checker gates, adapter allowlists, calldata commitments, cooldowns, caps, and owner cancellation.',
    details: ['Requires a configured deployed executor', 'Permissionless keeper execution', 'Owner-controlled cancellation']
  },
  {
    index: '07',
    title: 'Execution and performance',
    route: '/dashboard/executions',
    routeLabel: 'View executions',
    copy: 'Review policy decisions and durable execution attempts, then inspect signal outcomes and model performance across recorded horizons.',
    details: ['Idempotent execution audit trail', '1h, 6h, 24h, and 7d outcomes', 'Benchmark alpha and adverse-move evidence']
  }
] as const;

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

function CodeBlock({ children, label }: { children: string; label: string }) {
  return (
    <div className={styles.codeBlock}>
      <div>{label}</div>
      <pre><code>{children}</code></pre>
    </div>
  );
}

export default function DocsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <Link className={styles.brand} href="/" aria-label="Gold and Grith home">
            <Image src="/brand/gold-and-grith-mark.svg" alt="" width={34} height={34} priority />
            <span>Gold <em>&amp;</em> Grith</span>
            <small>Docs</small>
          </Link>
          <nav className={styles.headerNav} aria-label="Documentation actions">
            <Link href="/">Landing</Link>
            <Link href="/docs/evidence">Delivery evidence</Link>
            <Link className={styles.headerCta} href="/dashboard">Open terminal <ArrowIcon /></Link>
          </nav>
        </div>
      </header>

      <div className={`${styles.shell} ${styles.docsLayout}`}>
        <aside className={styles.sidebar}>
          <p>On this page</p>
          <nav aria-label="Documentation sections">
            {sections.map(([id, label], index) => (
              <a href={`#${id}`} key={id}><span>{String(index + 1).padStart(2, '0')}</span>{label}</a>
            ))}
          </nav>
          <div className={styles.sidebarNote}>
            <span>Deployment note</span>
            <p>Feature availability depends on backend configuration. Mainnet execution is not live-certified.</p>
          </div>
        </aside>

        <article className={styles.content}>
          <section className={styles.hero} id="start">
            <p className={styles.kicker}><span aria-hidden="true" /> Product documentation</p>
            <h1>Operate the trading intelligence desk.</h1>
            <p className={styles.heroLead}>
              Connect your wallet, configure alerts, read market and narrative evidence, and understand the boundary between operator approval and managed execution.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryCta} href="/dashboard/sodex/connect">Connect wallet <ArrowIcon /></Link>
              <Link className={styles.secondaryCta} href="/dashboard">Open dashboard <ArrowIcon /></Link>
              <Link className={styles.secondaryCta} href="/docs/evidence">Verify delivery <ArrowIcon /></Link>
            </div>
            <div className={styles.scopeNote}>
              <strong>Use testnet first.</strong>
              <span>Connected wallets sign an EIP-4361 login challenge. They do not sign server-submitted trades.</span>
            </div>
          </section>

          <section className={styles.docSection} id="wallet">
            <div className={styles.sectionHeading}>
              <p>01 · Connection</p>
              <h2>Connect a wallet and SoDEX account</h2>
              <span>The browser establishes a wallet-isolated session without receiving a private key.</span>
            </div>
            <ol className={styles.stepList}>
              <li>
                <span>1</span>
                <div><h3>Open the connection screen</h3><p>Go to <Link href="/dashboard/sodex/connect">Connect SoDEX</Link> and choose testnet or mainnet. Begin on ValueChain Testnet unless you have completed a separate production review.</p></div>
              </li>
              <li>
                <span>2</span>
                <div><h3>Approve the network</h3><p>The app requests ValueChain Testnet chain ID <code>138565</code> or ValueChain mainnet chain ID <code>286623</code>. Confirm the network in your wallet.</p></div>
              </li>
              <li>
                <span>3</span>
                <div><h3>Sign the login challenge</h3><p>Sign the domain-bound SIWE message. The one-time nonce creates an HttpOnly session scoped to that wallet; the signature is authentication, not a trade.</p></div>
              </li>
              <li>
                <span>4</span>
                <div><h3>Check account data</h3><p>Open positions, markets, or the order book. An empty position list is expected when the selected SoDEX account is flat.</p></div>
              </li>
            </ol>
          </section>

          <section className={styles.docSection} id="telegram">
            <div className={styles.sectionHeading}>
              <p>02 · Notifications</p>
              <h2>Connect the Telegram bot</h2>
              <span>Telegram delivers alerts and commands. The bot token and authorized chat ID remain on the backend.</span>
            </div>

            <div className={styles.setupGrid}>
              <div className={styles.setupSteps}>
                <article>
                  <span>01</span>
                  <div><h3>Create the bot</h3><p>Open <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>, send <code>/newbot</code>, and follow the prompts. Save the returned token as <code>TELEGRAM_BOT_TOKEN</code>.</p></div>
                </article>
                <article>
                  <span>02</span>
                  <div><h3>Get the chat ID</h3><p>Message <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer">@userinfobot</a> and copy its numeric user ID into <code>TELEGRAM_CHAT_ID</code>. Only that chat can operate the bot.</p></div>
                </article>
                <article>
                  <span>03</span>
                  <div><h3>Enable one worker</h3><p>Add the values to the long-lived backend environment. Enable long polling on exactly one replica, then restart the backend.</p></div>
                </article>
                <article>
                  <span>04</span>
                  <div><h3>Verify the connection</h3><p>Send <code>/start</code> and <code>/menu</code> from the authorized chat, then use the test action on <Link href="/dashboard/telegram">Telegram Setup</Link>.</p></div>
                </article>
              </div>

              <div className={styles.setupAside}>
                <CodeBlock label="Backend environment">{'ENABLE_TELEGRAM_BOT=true\nTELEGRAM_BOT_TOKEN=<bot_token>\nTELEGRAM_CHAT_ID=<numeric_chat_id>'}</CodeBlock>
                <div className={styles.warning}>
                  <strong>Long-lived backend required</strong>
                  <p>Keep Telegram polling disabled on serverless deployments. Run exactly one bot worker to avoid duplicate update processing.</p>
                </div>
              </div>
            </div>

            <h3 className={styles.subheading}>Useful bot commands</h3>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Command</th><th>Purpose</th></tr></thead>
                <tbody>
                  {botCommands.map(([command, purpose]) => (
                    <tr key={command}><td><code>{command}</code></td><td>{purpose}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.safetyLine}>Trading commands such as <code>/buy</code>, <code>/sell</code>, <code>/close</code>, and <code>/reduce</code> are policy-gated. Keep <code>EXECUTION_MODE=dry_run</code> until the managed registered-key path has been verified on testnet.</p>
          </section>

          <section className={styles.docSection} id="scanner">
            <div className={styles.sectionHeading}>
              <p>03 · Narrative intelligence</p>
              <h2>Use the Narrative Scanner</h2>
              <span>The scanner ranks sector attention and confirmation while retaining the evidence that produced each result.</span>
            </div>
            <div className={styles.twoColumn}>
              <div>
                <h3>What it evaluates</h3>
                <p>DeFi, AI, RWA, L1, L2, GameFi, DePIN, and Meme are scored using attention velocity, acceleration, source breadth and quality, catalysts, sentiment, and market confirmation.</p>
                <ul>
                  <li>Lifecycle: EMERGING, ACCELERATING, ESTABLISHED, CROWDED, FADING, or REVERSING</li>
                  <li>Opportunity and confidence scores with crowding context</li>
                  <li>ETF flow, macro support, leading assets, and wallet relevance</li>
                </ul>
              </div>
              <div>
                <h3>How to use it</h3>
                <ol>
                  <li>Open <Link href="/dashboard/scanner">Narrative Scanner</Link>.</li>
                  <li>Read the ranked radar and open the leading signal’s composition.</li>
                  <li>Review “Why now,” source breadth, catalysts, and invalidation evidence.</li>
                  <li>Set wallet-specific lifecycle, minimum-confidence, and maximum-crowding alerts.</li>
                </ol>
              </div>
            </div>
          </section>

          <section className={styles.docSection} id="graph">
            <div className={styles.sectionHeading}>
              <p>04 · Chart intelligence</p>
              <h2>Analyse a trading graph</h2>
              <span>Graph narratives are derived from the selected OHLCV series; missing price, volume, or indicator evidence is not invented.</span>
            </div>
            <ol className={styles.stepList}>
              <li><span>1</span><div><h3>Select the market</h3><p>Open <Link href="/dashboard/sodex/klines">SoDEX Klines</Link>, choose a symbol, then select a 1m, 5m, 15m, 1h, 4h, or 1d interval and a candle limit.</p></div></li>
              <li><span>2</span><div><h3>Run the narrative</h3><p>Select <strong>Analyse Graph Narrative</strong>. The backend analysis requires a sufficiently populated OHLCV history and evaluates only the returned series.</p></div></li>
              <li><span>3</span><div><h3>Read evidence and conflicts</h3><p>Compare EMA structure, RSI and MACD momentum, ATR volatility, Bollinger Bands, volume participation, recent support and resistance, and breakout state.</p></div></li>
              <li><span>4</span><div><h3>Use the invalidation</h3><p>Confidence measures agreement among available evidence—not future accuracy. Always read the conflicts, invalidation condition, and technical-analysis disclaimer.</p></div></li>
            </ol>
            <div className={styles.metricStrip}>
              <div><span>Trend</span><strong>EMA 9 / 21 / 50</strong></div>
              <div><span>Momentum</span><strong>RSI 14 + MACD</strong></div>
              <div><span>Volatility</span><strong>ATR 14 + bands</strong></div>
              <div><span>Structure</span><strong>Levels + breakout</strong></div>
            </div>
          </section>

          <section className={styles.docSection} id="features">
            <div className={styles.sectionHeading}>
              <p>05 · Product map</p>
              <h2>Feature guide</h2>
              <span>Each feature links to the corresponding operator view.</span>
            </div>
            <div className={styles.featureGrid}>
              {featureGuide.map((feature) => (
                <article className={styles.feature} key={feature.index}>
                  <div className={styles.featureTop}><span>{feature.index}</span><h3>{feature.title}</h3></div>
                  <p>{feature.copy}</p>
                  <ul>{feature.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                  <Link href={feature.route}>{feature.routeLabel} <ArrowIcon /></Link>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.docSection} id="security">
            <div className={styles.sectionHeading}>
              <p>06 · Execution boundary</p>
              <h2>Know what signs what</h2>
              <span>Identity, approval, and execution use separate boundaries.</span>
            </div>
            <div className={styles.boundaryFlow}>
              <div><span>1</span><strong>Wallet</strong><p>Signs the SIWE login challenge and establishes the operator identity.</p></div>
              <i aria-hidden="true">→</i>
              <div><span>2</span><strong>Policy</strong><p>Checks network, mode, symbol, notional, leverage, cooldown, and idempotency.</p></div>
              <i aria-hidden="true">→</i>
              <div><span>3</span><strong>Registered key</strong><p>Signs the exact SoDEX action from deployment-managed secrets when execution is enabled.</p></div>
            </div>
            <div className={styles.warningList}>
              <p><strong>Never</strong> paste a private key into Telegram, the browser, source control, or a public environment variable.</p>
              <p><strong>Use</strong> a dedicated, revocable registered SoDEX API key that is distinct from the master account.</p>
              <p><strong>Keep</strong> mainnet disabled until signer verification, caps, monitoring, and a low-notional canary are explicitly approved.</p>
            </div>
          </section>

          <section className={styles.docSection} id="troubleshooting">
            <div className={styles.sectionHeading}>
              <p>07 · Troubleshooting</p>
              <h2>Common setup problems</h2>
            </div>
            <div className={styles.troubleshootingGrid}>
              <article><h3>Bot stays silent</h3><p>Confirm the token, numeric chat ID, and <code>ENABLE_TELEGRAM_BOT=true</code>; restart the long-lived backend. Messages from any other chat are ignored.</p></article>
              <article><h3>No positions appear</h3><p>Confirm the selected network and wallet. A flat SoDEX account correctly returns an empty position list.</p></article>
              <article><h3>Graph analysis is unavailable</h3><p>Choose a market with enough valid candles, try a longer interval or larger candle limit, and verify the SoDEX candle feed is responding.</p></article>
              <article><h3>Automation says undeployed</h3><p>The selected network needs a configured and audited Shield automation executor address. Repository bytecode alone is not a deployment.</p></article>
              <article><h3>API key is rejected</h3><p>Verify the exact non-default registered key name, its signer address, the selected chain, and the managed secret. Master-wallet signing is blocked.</p></article>
              <article><h3>Need a complete health check</h3><p>Open the dashboard status, check backend <code>/health</code>, then verify authenticated API health and Telegram with <code>/status</code>.</p></article>
            </div>
          </section>

          <footer className={styles.footer}>
            <div className={styles.footerIdentity}><strong>Gold &amp; Grith documentation</strong><span>Observe · Reason · Act</span></div>
            <div className={styles.footerLinks}>
              <Link href="/docs/evidence">Delivery evidence <ArrowIcon /></Link>
              <Link href="/dashboard">Open terminal <ArrowIcon /></Link>
            </div>
          </footer>
        </article>
      </div>
    </main>
  );
}
