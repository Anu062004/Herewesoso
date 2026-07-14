const DEPLOYED_PRODUCTION_BACKEND = 'https://35-175-76-98.sslip.io';

export function backendBaseUrl(): string {
  const configured = String(process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
  const production = process.env.NODE_ENV === 'production';
  // Existing Vercel deployments used the raw EC2 HTTP address. Never reuse
  // that value in production; migrate transparently to the TLS endpoint.
  const value = production
    ? (configured.startsWith('https://') ? configured : DEPLOYED_PRODUCTION_BACKEND)
    : (configured || 'http://localhost:3001');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('API_BASE_URL must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('API_BASE_URL must use HTTP or HTTPS.');
  }
  if (production && parsed.protocol !== 'https:') {
    throw new Error('API_BASE_URL must use HTTPS in production.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('API_BASE_URL must not contain credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('API_BASE_URL must not contain a query or fragment.');
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}`;
}
