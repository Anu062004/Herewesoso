import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';

const capabilities = [
  {
    number: '01',
    title: 'Read the market',
    copy: 'ETF flow, sector momentum, news, and macro events distilled into one clear signal.',
    href: '/dashboard/scanner',
    link: 'Explore signals'
  },
  {
    number: '02',
    title: 'Understand the risk',
    copy: 'See leverage, liquidation distance, and portfolio pressure before they become urgent.',
    href: '/dashboard/shield',
    link: 'View risk tools'
  },
  {
    number: '03',
    title: 'Approve the action',
    copy: 'Review the exact order, sign with your connected wallet, and send it to SoDEX.',
    href: '/dashboard/executions',
    link: 'See executions'
  }
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5.5 5.7v5.5c0 4.1 2.6 7.8 6.5 9.8 3.9-2 6.5-5.7 6.5-9.8V5.7L12 3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function ProductPreview() {
  return (
    <div className={styles.previewWrap} aria-label="Gold and Grith portfolio risk preview">
      <div className={styles.previewGlow} aria-hidden="true" />
      <div className={styles.preview}>
        <div className={styles.previewHeader}>
          <div>
            <span className={styles.previewLabel}>Portfolio overview</span>
            <span className={styles.previewAccount}>0x71F4…A90C</span>
          </div>
          <span className={styles.liveStatus}>
            <i aria-hidden="true" /> SoDEX testnet
          </span>
        </div>

        <div className={styles.riskSummary}>
          <div>
            <span className={styles.summaryLabel}>Account protection</span>
            <strong>All clear</strong>
            <p>No position is inside the critical liquidation range.</p>
          </div>
          <div className={styles.riskScore}>
            <span>Risk score</span>
            <div>
              <strong>24</strong>
              <small>/100</small>
            </div>
          </div>
        </div>

        <div className={styles.positions}>
          <div className={styles.positionHead}>
            <span>Position</span>
            <span>Leverage</span>
            <span>Liquidation distance</span>
          </div>
          <div className={styles.positionRow}>
            <div className={styles.asset}>
              <span className={styles.assetMark}>B</span>
              <span><strong>BTC</strong><small>Long</small></span>
            </div>
            <span>4.0×</span>
            <span className={styles.safeValue}>38.2%</span>
          </div>
          <div className={styles.positionRow}>
            <div className={styles.asset}>
              <span className={`${styles.assetMark} ${styles.assetMarkMuted}`}>E</span>
              <span><strong>ETH</strong><small>Long</small></span>
            </div>
            <span>2.5×</span>
            <span className={styles.safeValue}>46.8%</span>
          </div>
        </div>

        <div className={styles.previewFooter}>
          <span>Next risk scan in 18 min</span>
          <span className={styles.walletNote}>Wallet approval required for every action</span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <Link className={styles.brand} href="/" aria-label="Gold and Grith home">
            <Image
              src="/brand/gold-and-grith-mark.svg"
              alt=""
              width={36}
              height={36}
              priority
            />
            <span>Gold <em>&amp;</em> Grith</span>
          </Link>

          <nav className={styles.nav} aria-label="Primary navigation">
            <a href="#product">Product</a>
            <a href="#security">Security</a>
          </nav>

          <Link className={styles.headerCta} href="/dashboard">
            Open terminal <ArrowIcon />
          </Link>
        </div>
      </header>

      <section className={`${styles.shell} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true" /> Crypto intelligence, made actionable</p>
          <h1>See risk clearly.<br /><span>Act with confidence.</span></h1>
          <p className={styles.lead}>
            Gold &amp; Grith turns live market context and open-position risk into one calm operating view for crypto desks.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/dashboard">
              Launch terminal <ArrowIcon />
            </Link>
            <Link className={styles.secondaryCta} href="/dashboard/sodex/connect">
              Connect a wallet <ArrowIcon />
            </Link>
          </div>
          <div className={styles.trustLine} aria-label="Product highlights">
            <span>Live SoDEX context</span>
            <span>Wallet-native signing</span>
            <span>No custody</span>
          </div>
        </div>

        <ProductPreview />
      </section>

      <section className={`${styles.shell} ${styles.product}`} id="product">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionKicker}>One focused workflow</p>
          <h2>From signal to signed action, without the noise.</h2>
        </div>

        <div className={styles.capabilityGrid}>
          {capabilities.map((capability) => (
            <article className={styles.capability} key={capability.number}>
              <span className={styles.capabilityNumber}>{capability.number}</span>
              <h3>{capability.title}</h3>
              <p>{capability.copy}</p>
              <Link href={capability.href}>
                {capability.link} <ArrowIcon />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.shell} ${styles.security}`} id="security">
        <div className={styles.securityIcon}><ShieldIcon /></div>
        <div className={styles.securityCopy}>
          <p className={styles.securityKicker}>Wallet-native security</p>
          <h2>Your wallet stays yours.</h2>
          <p>
            Gold &amp; Grith prepares the action. You inspect and approve it with your connected wallet using typed EIP-712 signing. Private keys never enter our backend.
          </p>
        </div>
        <Link className={styles.securityCta} href="/dashboard/sodex/connect">
          Connect securely <ArrowIcon />
        </Link>
      </section>

      <footer className={`${styles.shell} ${styles.footer}`}>
        <Link className={styles.footerBrand} href="/">
          <Image src="/brand/gold-and-grith-mark.svg" alt="" width={28} height={28} />
          <span>Gold &amp; Grith</span>
        </Link>
        <p>Market context in. Risk decisions out.</p>
        <Link href="/dashboard">Enter terminal <ArrowIcon /></Link>
      </footer>
    </main>
  );
}
