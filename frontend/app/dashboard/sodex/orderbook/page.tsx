import OrderbookClient from './OrderbookClient';

export default async function SodexOrderbookPage({
  searchParams
}: {
  searchParams?: Promise<{ symbol?: string | string[] }>;
}) {
  const query = await searchParams;
  const requested = typeof query?.symbol === 'string' ? query.symbol.trim().toUpperCase() : '';
  const initialSymbol = /^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$/.test(requested) ? requested : 'BTC-USD';
  return <OrderbookClient initialSymbol={initialSymbol} />;
}
