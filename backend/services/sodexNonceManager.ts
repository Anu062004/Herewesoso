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

function resetNonceState(): void {
  lastNonceBySigner.clear();
}

export = {
  nextNonce,
  resetNonceState
};
