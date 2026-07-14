'use client';

import { useSyncExternalStore } from 'react';

let now = Date.now();
let timer: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null && typeof window !== 'undefined') {
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((entry) => entry());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

export function useSharedNow() {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}
