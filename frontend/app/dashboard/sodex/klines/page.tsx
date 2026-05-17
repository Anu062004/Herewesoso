import KlinesClient from './KlinesClient';

export default function SodexKlinesPage({
  searchParams
}: {
  searchParams?: { symbol?: string };
}) {
  return <KlinesClient initialSymbol={searchParams?.symbol || 'BTC-USD'} />;
}
