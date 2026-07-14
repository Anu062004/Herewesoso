import crypto from 'crypto';
import type { Request } from 'express';
import { isProduction } from '../config/env';
import supabaseService = require('./supabase');

export type WalletNetwork = 'testnet' | 'mainnet';

export interface WalletSession {
  address: string;
  network: WalletNetwork;
  issuedAt: number;
  expiresAt: number;
}

interface WalletChallenge extends WalletSession {
  id: string;
  nonce: string;
  used: boolean;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const configuredSessionTtlMs = Number(process.env.SODEX_SESSION_TTL_MS || 24 * 60 * 60 * 1000);
const SESSION_TTL_MS = Number.isFinite(configuredSessionTtlMs)
  ? Math.max(5 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, configuredSessionTtlMs))
  : 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'gold_grith_wallet_session';
const challenges = new Map<string, WalletChallenge>();
const { supabase, isSupabaseConfigured } = supabaseService;

const configuredSecret = process.env.SODEX_SESSION_SECRET || process.env.SESSION_SECRET;
const sessionSecret = configuredSecret || crypto.randomBytes(32).toString('hex');

if (!configuredSecret) {
  console.warn('[WalletAuth] SODEX_SESSION_SECRET is not configured; sessions will be invalidated on restart.');
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((result, entry) => {
    const separator = entry.indexOf('=');
    if (separator < 0) return result;
    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
    return result;
  }, {});
}

function cleanupChallenges(now = Date.now()) {
  for (const [id, challenge] of challenges) {
    if (challenge.used || challenge.expiresAt <= now) challenges.delete(id);
  }
}

export function buildLoginMessage(challenge: Pick<WalletChallenge, 'address' | 'network' | 'issuedAt' | 'nonce'>): string {
  return [
    'Gold & Grith SoDEX login',
    `Wallet: ${challenge.address.toLowerCase()}`,
    `Environment: ${challenge.network}`,
    `Issued at: ${challenge.issuedAt}`,
    `Nonce: ${challenge.nonce}`,
    '',
    'This signature proves wallet ownership. It does not authorize a trade or transfer.'
  ].join('\n');
}

export async function createChallenge(address: string, network: WalletNetwork): Promise<WalletChallenge & { message: string }> {
  cleanupChallenges();
  const issuedAt = Date.now();
  const challenge: WalletChallenge = {
    id: crypto.randomUUID(),
    nonce: crypto.randomBytes(16).toString('hex'),
    address,
    network,
    issuedAt,
    expiresAt: issuedAt + CHALLENGE_TTL_MS,
    used: false
  };
  if (isProduction()) {
    if (!isSupabaseConfigured) throw new Error('Durable wallet challenges require Supabase.');
    const { error: cleanupError } = await supabase
      .from('wallet_login_challenges')
      .delete()
      .lt('expires_at', new Date().toISOString());
    if (cleanupError) throw cleanupError;
    const { error } = await supabase.from('wallet_login_challenges').insert({
      id: challenge.id,
      address: challenge.address.toLowerCase(),
      network: challenge.network,
      nonce: challenge.nonce,
      issued_at: new Date(challenge.issuedAt).toISOString(),
      expires_at: new Date(challenge.expiresAt).toISOString()
    });
    if (error) throw error;
  } else {
    challenges.set(challenge.id, challenge);
  }
  return { ...challenge, message: buildLoginMessage(challenge) };
}

export async function consumeChallenge(id: string, address: string, network: WalletNetwork): Promise<WalletChallenge | null> {
  if (isProduction()) {
    if (!isSupabaseConfigured) return null;
    const usedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('wallet_login_challenges')
      .update({ used_at: usedAt })
      .eq('id', id)
      .eq('address', address.toLowerCase())
      .eq('network', network)
      .is('used_at', null)
      .gt('expires_at', usedAt)
      .select('*')
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: String(data.id),
      address: String(data.address),
      network: data.network === 'mainnet' ? 'mainnet' : 'testnet',
      nonce: String(data.nonce),
      issuedAt: new Date(String(data.issued_at)).getTime(),
      expiresAt: new Date(String(data.expires_at)).getTime(),
      used: true
    };
  }

  cleanupChallenges();
  const challenge = challenges.get(id);
  if (!challenge || challenge.used || challenge.expiresAt <= Date.now()) return null;
  if (challenge.address.toLowerCase() !== address.toLowerCase() || challenge.network !== network) return null;
  challenge.used = true;
  challenges.delete(id);
  return challenge;
}

export function createSession(address: string, network: WalletNetwork): { token: string; session: WalletSession } {
  const issuedAt = Date.now();
  const session: WalletSession = { address, network, issuedAt, expiresAt: issuedAt + SESSION_TTL_MS };
  const payload = encode(JSON.stringify(session));
  return { token: `${payload}.${sign(payload)}`, session };
}

export function verifySessionToken(token: string | undefined): WalletSession | null {
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as WalletSession;
    const now = Date.now();
    const validAddress = typeof session.address === 'string' && /^0x[0-9a-fA-F]{40}$/.test(session.address);
    const validTimes = Number.isFinite(session.issuedAt)
      && Number.isFinite(session.expiresAt)
      && session.issuedAt <= now + 60_000
      && session.expiresAt > now
      && session.expiresAt - session.issuedAt <= SESSION_TTL_MS;
    if (!validAddress || !['testnet', 'mainnet'].includes(session.network) || !validTimes) return null;
    return session;
  } catch {
    return null;
  }
}

export function getWalletSession(req: Request): WalletSession | null {
  return verifySessionToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
}

function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  return req.secure || forwarded === 'https' || process.env.NODE_ENV === 'production';
}

export function sessionCookie(req: Request, token: string): string {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Priority=High; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`;
}

export function clearSessionCookie(req: Request): string {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Priority=High; Max-Age=0${secure}`;
}

export const walletAuth = {
  buildLoginMessage,
  clearSessionCookie,
  consumeChallenge,
  createChallenge,
  createSession,
  getWalletSession,
  sessionCookie,
  verifySessionToken
};

export default walletAuth;
