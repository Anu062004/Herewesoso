import KlinesClient from './KlinesClient';

export default async function SodexKlinesPage({
  searchParams
}: {
  searchParams?: Promise<{ symbol?: string | string[] }>;
}) {
  const query = await searchParams;
  const requested = typeof query?.symbol === 'string' ? query.symbol.trim().toUpperCase() : '';
  const initialSymbol = /^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/.test(requested) ? requested : 'BTC-USD';
  return <KlinesClient initialSymbol={initialSymbol} />;
}
