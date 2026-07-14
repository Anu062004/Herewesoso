import fs = require('fs');
import path = require('path');

const KEY_FILE = path.join(__dirname, '../../.sodex_key');

type KeyProviderMode = 'env' | 'local_file' | 'managed' | 'disabled';

interface KeyStatus {
  configured: boolean;
  provider: KeyProviderMode;
  source: 'env' | 'local_file' | 'managed' | 'none';
  runtimeWritable: boolean;
  mainnetSafe: boolean;
  message: string;
}

function providerMode(): KeyProviderMode {
  const configured = String(process.env.KEY_PROVIDER || process.env.SODEX_KEY_PROVIDER || '').toLowerCase();
  if (configured === 'env' || configured === 'local_file' || configured === 'managed' || configured === 'disabled') {
    return configured;
  }
  return 'disabled';
}

function normalize(privateKey: string): string {
  const trimmed = privateKey.trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function hasLocalFile() {
  try {
    return fs.existsSync(KEY_FILE);
  } catch {
    return false;
  }
}

function loadPrivateKey(): string | null {
  const provider = providerMode();

  if (provider === 'disabled') return null;

  if (provider === 'managed') {
    return process.env.SODEX_MANAGED_PRIVATE_KEY || process.env.SODEX_API_PRIVATE_KEY || null;
  }

  if (provider === 'env') {
    return process.env.SODEX_API_PRIVATE_KEY || process.env.SODEX_PRIVATE_KEY || null;
  }

  if (process.env.SODEX_API_PRIVATE_KEY) return process.env.SODEX_API_PRIVATE_KEY;
  if (hasLocalFile()) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  return process.env.SODEX_PRIVATE_KEY || null;
}

function saveRuntimePrivateKey(privateKey: string): void {
  const provider = providerMode();
  if (provider === 'managed' || provider === 'env' || provider === 'disabled') {
    throw new Error(`Runtime key writes are disabled for KEY_PROVIDER=${provider}.`);
  }

  fs.writeFileSync(KEY_FILE, normalize(privateKey), { mode: 0o600 });
}

function removeRuntimePrivateKey(): void {
  const provider = providerMode();
  if (provider === 'managed' || provider === 'env' || provider === 'disabled') {
    return;
  }

  try {
    if (hasLocalFile()) fs.unlinkSync(KEY_FILE);
  } catch {}
}

function getKeyStatus(): KeyStatus {
  const provider = providerMode();
  const envKey = Boolean(process.env.SODEX_API_PRIVATE_KEY || process.env.SODEX_PRIVATE_KEY);
  const managedKey = Boolean(process.env.SODEX_MANAGED_PRIVATE_KEY || process.env.SODEX_API_PRIVATE_KEY);
  const fileKey = hasLocalFile();
  const configured =
    provider === 'managed' ? managedKey : provider === 'env' ? envKey : provider === 'local_file' ? envKey || fileKey : false;
  let source: KeyStatus['source'] = 'none';
  if (provider === 'managed' && managedKey) source = 'managed';
  else if (provider === 'env' && envKey) source = 'env';
  else if (provider === 'local_file' && envKey) source = 'env';
  else if (provider === 'local_file' && fileKey) source = 'local_file';

  return {
    configured,
    provider,
    source,
    runtimeWritable: provider === 'local_file',
    mainnetSafe: provider === 'managed',
    message: configured
      ? `SoDEX signing key loaded from ${source}.`
      : `No SoDEX signing key configured for KEY_PROVIDER=${provider}.`
  };
}

export = {
  getKeyStatus,
  loadPrivateKey,
  removeRuntimePrivateKey,
  saveRuntimePrivateKey
};
