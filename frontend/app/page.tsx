import Image from 'next/image';
import Link from 'next/link';
import styles from './page.workbench.module.css';

const workflow = [
  {
    number: '01',
    label: 'Observe',
    title: 'Read the market in context.',
    copy: 'Bring SoDEX price action together with macro events, news, sector momentum, and ETF flow.',
    href: '/dashboard/scanner',
    link: 'Open the scanner'
  },
  {
    number: '02',
    label: 'Reason',
    title: 'See pressure before it becomes urgency.',
    copy: 'Review open-position exposure and liquidation risk through one portfolio-aware Shield workflow.',
    href: '/dashboard/shield',
    link: 'Inspect Shield'
  },
  {
    number: '03',
    label: 'Act',
    title: 'Approve the exact action.',
    copy: 'Authenticate with your operator wallet, review policy, and send through the registered SoDEX execution key.',
    href: '/dashboard/executions',
    link: 'Review executions'
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
            <a href="#workbench">Workbench</a>
            <a href="#workflow">Workflow</a>
            <a href="#security">Security</a>
          </nav>

          <Link className={styles.headerCta} href="/dashboard">
            Open terminal <ArrowIcon />
          </Link>
        </div>
      </header>

      <section className={`${styles.shell} ${styles.intro}`} id="workbench">
        <div className={styles.introHeading}>
          <p className={styles.kicker}>
            <span aria-hidden="true" /> SoDEX trading intelligence
          </p>
          <h1>Trade with the whole market in view.</h1>
        </div>

        <div className={styles.introAside}>
          <p>
            Live price action, order-book liquidity, portfolio risk, and operator-approved execution—brought into one focused trading desk.
          </p>
          <div className={styles.introActions}>
            <Link className={styles.primaryCta} href="/dashboard">
              Launch terminal <ArrowIcon />
            </Link>
            <Link
              className={styles.docsCta}
              href="https://github.com/Anu062004/Herewesoso/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              aria-label="View project documentation (opens in a new tab)"
            >
              View docs <ArrowIcon />
            </Link>
            <Link className={styles.textCta} href="/dashboard/sodex/connect">
              Connect operator wallet <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.productStage}`} aria-labelledby="product-caption">
        <figure className={styles.productFigure}>
          <div className={styles.screenFrame}>
            <Image
              src="/product/sodex-trading-screen.png"
              alt="SoDEX BTC and USDC spot trading screen with live chart, market data, and order book"
              width={2326}
              height={1338}
              sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1280px) calc(100vw - 48px), 1220px"
              priority
            />
          </div>
          <figcaption className={styles.screenCaption} id="product-caption">
            <span>Trading workspace</span>
            <span>SoDEX · BTC/USDC spot</span>
          </figcaption>
        </figure>

        <div className={styles.annotationRail} aria-label="Workbench capabilities">
          <div>
            <span className={styles.annotationIndex}>A</span>
            <p><strong>Stay oriented.</strong> Keep price action, volume, and liquidity visible while you assess risk.</p>
          </div>
          <div>
            <span className={styles.annotationIndex}>B</span>
            <p><strong>Keep control.</strong> Move from market evidence to an operator-approved action with a traceable boundary.</p>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.workflow}`} id="workflow">
        <div className={styles.workflowLead}>
          <p className={styles.sectionLabel}>The operating loop</p>
          <h2>Three deliberate moves. One connected desk.</h2>
        </div>

        <div className={styles.workflowList}>
          {workflow.map((step) => (
            <article className={styles.workflowRow} key={step.number}>
              <span className={styles.workflowNumber}>{step.number}</span>
              <p className={styles.workflowLabel}>{step.label}</p>
              <div className={styles.workflowCopy}>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
              <Link href={step.href} aria-label={`${step.link}: ${step.title}`}>
                {step.link} <ArrowIcon />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.shell} ${styles.security}`} id="security">
        <div className={styles.securityMark}><ShieldIcon /></div>
        <div className={styles.securityCopy}>
          <p className={styles.sectionLabel}>Separated signing boundary</p>
          <h2>Your wallet proves identity. It does not sign the trade.</h2>
          <p>
            Gold &amp; Grith applies policy and audit controls, then a dedicated registered key signs the exact SoDEX action from deployment-managed secrets.
          </p>
        </div>
        <Link className={styles.securityCta} href="/dashboard/sodex/connect">
          Authenticate securely <ArrowIcon />
        </Link>
      </section>

      <aside className={`${styles.shell} ${styles.actionDock}`} aria-label="Launch Gold and Grith">
        <div>
          <span className={styles.dockStatus} aria-hidden="true" />
          <p><strong>Ready for the desk?</strong> Enter the live operating view.</p>
        </div>
        <Link href="/dashboard">
          Open Gold &amp; Grith <ArrowIcon />
        </Link>
      </aside>

      <footer className={`${styles.shell} ${styles.footer}`}>
        <p><strong>Gold &amp; Grith</strong> · Observe · Reason · Act</p>
        <Link href="/dashboard">Enter terminal <ArrowIcon /></Link>
      </footer>
    </main>
  );
}
