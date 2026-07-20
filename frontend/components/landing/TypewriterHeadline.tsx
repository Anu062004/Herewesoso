'use client';

import { useEffect, useState } from 'react';

import styles from './TypewriterHeadline.module.css';

const PHRASE = 'the whole market in view.';

export default function TypewriterHeadline() {
  const [visibleText, setVisibleText] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (reducedMotion.matches) {
      setVisibleText(PHRASE);
      setComplete(true);
      return undefined;
    }

    let characterIndex = 0;
    let intervalId: number | undefined;

    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        characterIndex += 1;
        setVisibleText(PHRASE.slice(0, characterIndex));

        if (characterIndex >= PHRASE.length) {
          window.clearInterval(intervalId);
          setComplete(true);
        }
      }, 44);
    }, 320);

    return () => {
      window.clearTimeout(startId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  return (
    <h1>
      <span className={styles.srOnly}>Trade with the whole market in view.</span>
      <span aria-hidden="true">
        Trade with {visibleText}
        <span className={`${styles.cursor} ${complete ? styles.cursorComplete : ''}`} />
      </span>
    </h1>
  );
}
