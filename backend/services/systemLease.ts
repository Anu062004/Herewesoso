import crypto from 'crypto';

import { isProduction } from '../config/env';
import supabaseService = require('./supabase');

const { supabase, isSupabaseConfigured } = supabaseService;

export async function acquireLease(key: string, ttlMs: number): Promise<string | null> {
  if (!isProduction()) return crypto.randomUUID();
  if (!isSupabaseConfigured) throw new Error('Distributed leases require Supabase.');
  const owner = crypto.randomUUID();
  const { data, error } = await supabase.rpc('acquire_system_lease', {
    p_lease_key: key,
    p_lease_owner: owner,
    p_lease_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1000))
  });
  if (error) throw error;
  return data === true ? owner : null;
}

export async function releaseLease(key: string, owner: string): Promise<void> {
  if (!isProduction()) return;
  const { error } = await supabase
    .from('system_leases')
    .delete()
    .eq('lease_key', key)
    .eq('owner', owner);
  if (error) throw error;
}
