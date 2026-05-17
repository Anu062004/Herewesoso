'use client';

import { useEffect, useRef, useState } from 'react';

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
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(initialData ? Date.now() : null);
  const [now, setNow] = useState(Date.now());
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function runFetch(silent = false) {
    if (!enabled) {
      return;
    }

    if (!silent) {
      setLoading(data === undefined);
    }

    setIsFetching(true);

    try {
      const next = await fetcherRef.current();

      if (!mountedRef.current) {
        return;
      }

      setData(next);
      setError(null);
      setLastSuccessAt(Date.now());
    } catch (fetchError) {
      if (!mountedRef.current) {
        return;
      }

      setError(fetchError instanceof Error ? fetchError.message : 'Request failed.');
    } finally {
      if (!mountedRef.current) {
        return;
      }

      setLoading(false);
      setIsFetching(false);
    }
  }

  useEffect(() => {
    if (initialData === undefined) {
      void runFetch();
    }
  }, []);

  useEffect(() => {
    if (!enabled || !key) {
      return;
    }

    setError(null);
    void runFetch(true);
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = window.setInterval(() => {
      void runFetch(true);
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, intervalMs]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

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
