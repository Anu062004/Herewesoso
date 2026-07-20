import supabaseService = require('./supabase');

const lastNonceBySigner = new Map<string, bigint>();

function normalizeSignerKey(value: string): string {
  return value.trim().toLowerCase();
}

function nowMs(): bigint {
  return BigInt(Date.now());
}

function nextNonce(signerAddress: string, timestampMs: bigint = nowMs()): bigint {
  const key = normalizeSignerKey(signerAddress);
  const previous = lastNonceBySigner.get(key) || 0n;
  const next = timestampMs > previous ? timestampMs : previous + 1n;
  lastNonceBySigner.set(key, next);
  return next;
}

async function allocateNonce(signerAddress: string, timestampMs: bigint = nowMs()): Promise<bigint> {
  const executionMode = String(process.env.EXECUTION_MODE || 'dry_run').toLowerCase();
  const liveExecution = executionMode === 'testnet' || executionMode === 'mainnet_canary';
  if (!liveExecution) return nextNonce(signerAddress, timestampMs);

  if (!supabaseService.isSupabaseConfigured) {
    throw new Error('Live SoDEX signing requires the durable Supabase nonce allocator.');
  }

  const signerKey = normalizeSignerKey(signerAddress);
  const { data, error } = await supabaseService.supabase.rpc('allocate_sodex_nonce', {
    p_signer_address: signerKey,
    p_minimum_nonce: timestampMs.toString()
  });
  if (error) throw new Error(`Could not allocate a durable SoDEX nonce: ${error.message}`);

  let allocated: bigint;
  try {
    allocated = BigInt(String(data));
  } catch {
    throw new Error('The durable SoDEX nonce allocator returned an invalid nonce.');
  }
  if (allocated < timestampMs) {
    throw new Error('The durable SoDEX nonce allocator returned a stale nonce.');
  }
  lastNonceBySigner.set(signerKey, allocated);
  return allocated;
}

function resetNonceState(): void {
  lastNonceBySigner.clear();
}

export = {
  allocateNonce,
  nextNonce,
  resetNonceState
};
