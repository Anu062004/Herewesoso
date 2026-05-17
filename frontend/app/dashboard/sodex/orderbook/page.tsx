import OrderbookClient from './OrderbookClient';

export default function SodexOrderbookPage({
  searchParams
}: {
  searchParams?: { symbol?: string };
}) {
  return <OrderbookClient initialSymbol={searchParams?.symbol || 'BTC-USD'} />;
}
