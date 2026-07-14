import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import { isProduction, operatorWallets, timingSafeSecretMatch } from '../config/env';
import walletAuth = require('../services/walletAuth');
import supabaseService = require('../services/supabase');

const { supabase, isSupabaseConfigured } = supabaseService;

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimit(options: { name: string; windowMs: number; max: number; distributed?: boolean }) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.name}:${clientKey(req)}`;
    let bucket: RateBucket;

    if (options.distributed && isProduction()) {
      if (!isSupabaseConfigured) {
        return res.status(503).json({ error: 'Rate-limit service is unavailable.', code: 'RATE_LIMIT_UNAVAILABLE' });
      }
      try {
        const { data, error } = await supabase.rpc('consume_api_rate_limit', {
          p_rate_key: key,
          p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000))
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        bucket = {
          count: Number(row?.request_count || 0),
          resetAt: new Date(String(row?.reset_at || now + options.windowMs)).getTime()
        };
      } catch {
        return res.status(503).json({ error: 'Rate-limit service is unavailable.', code: 'RATE_LIMIT_UNAVAILABLE' });
      }
    } else {
      const current = buckets.get(key);
      bucket = !current || current.resetAt <= now
        ? { count: 0, resetAt: now + options.windowMs }
        : current;
      bucket.count += 1;
      buckets.set(key, bucket);
    }

    if (buckets.size > 10_000) {
      for (const [entryKey, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(entryKey);
      }
    }

    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
    }

    return next();
  };
}

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    console.log(JSON.stringify({
      level: 'info',
      event: 'http_request',
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1))
    }));
  });
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'no-store');
  if (isProduction()) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

export function requireWallet(req: Request, res: Response, next: NextFunction) {
  const session = walletAuth.getWalletSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Connect and sign in with your SoDEX wallet.', code: 'AUTH_REQUIRED' });
  }
  res.locals.walletSession = session;
  return next();
}

export function requireOperator(req: Request, res: Response, next: NextFunction) {
  const session = walletAuth.getWalletSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Operator wallet authentication is required.', code: 'AUTH_REQUIRED' });
  }

  const allowed = operatorWallets();
  if ((isProduction() || allowed.length > 0) && !allowed.includes(session.address.toLowerCase())) {
    return res.status(403).json({ error: 'This wallet is not an authorized operator.', code: 'OPERATOR_REQUIRED' });
  }

  res.locals.walletSession = session;
  return next();
}

function hasCronAuthorization(req: Request): boolean {
  const expected = process.env.CRON_SECRET || '';
  const authorization = req.header('authorization') || '';
  const actual = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return timingSafeSecretMatch(actual, expected);
}

export function requireOperatorOrCron(req: Request, res: Response, next: NextFunction) {
  if (hasCronAuthorization(req)) return next();
  return requireOperator(req, res, next);
}
