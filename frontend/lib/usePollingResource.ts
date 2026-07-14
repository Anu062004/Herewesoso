'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedNow } from '@/lib/useSharedNow';

type PollingState = 'fresh' | 'stale' | 'error';

interface Options<T> {
  fetcher: () => Promise<T>;
  intervalMs: number;
  initialData?: T;
  enabled?: boolean;
  key?: string;
}

export interface PollingResource<T> {
  data: T | undefined;
  loading: boolean;
  isFetching: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastSuccessAt: number | null;
  nextPollInMs: number;
  freshness: PollingState;
}

export function usePollingResource<T>({
  fetcher,
  intervalMs,
  initialData,
  enabled = true,
  key
}: Options<T>): PollingResource<T> {
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(initialData === undefined);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(initialData !== undefined ? Date.now() : null);
  const now = useSharedNow();
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  const dataRef = useRef(data);
  const initialFetchRef = useRef(false);
  const inFlightRef = useRef(false);
  const failuresRef = useRef(0);
  const nextAllowedAtRef = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  dataRef.current = data;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runFetch = useCallback(async (silent = false) => {
    if (!enabled || inFlightRef.current || Date.now() < nextAllowedAtRef.current) {
      return;
    }

    inFlightRef.current = true;

    if (!silent) {
      setLoading(dataRef.current === undefined);
    }

    setIsFetching(true);

    try {
      const next = await fetcherRef.current();

      if (!mountedRef.current) {
        return;
      }

      setData(next);
      dataRef.current = next;
      setError(null);
      setLastSuccessAt(Date.now());
      failuresRef.current = 0;
      nextAllowedAtRef.current = 0;
    } catch (fetchError) {
      if (!mountedRef.current) {
        return;
      }

      setError(fetchError instanceof Error ? fetchError.message : 'Request failed.');
      failuresRef.current += 1;
      nextAllowedAtRef.current = Date.now() + Math.min(intervalMs * 4, 1000 * 2 ** failuresRef.current);
    } finally {
      inFlightRef.current = false;
      if (!mountedRef.current) {
        return;
      }

      setLoading(false);
      setIsFetching(false);
    }
  }, [enabled, intervalMs]);

  useEffect(() => {
    if (enabled && !initialFetchRef.current && initialData === undefined) {
      initialFetchRef.current = true;
      void runFetch();
    }
  }, [enabled, initialData, runFetch]);

  useEffect(() => {
    if (!enabled || !key) {
      return;
    }

    setError(null);
    void runFetch(true);
  }, [key, enabled, runFetch]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void runFetch(true);
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, intervalMs, runFetch]);

  const ageMs = lastSuccessAt ? now - lastSuccessAt : intervalMs;
  const nextPollInMs = lastSuccessAt ? Math.max(0, intervalMs - ageMs) : intervalMs;
  const freshness: PollingState = error ? 'error' : ageMs < intervalMs / 2 ? 'fresh' : 'stale';

  return {
    data,
    loading,
    isFetching,
    error,
    refresh: async () => {
      await runFetch(true);
    },
    lastSuccessAt,
    nextPollInMs,
    freshness
  };
}
