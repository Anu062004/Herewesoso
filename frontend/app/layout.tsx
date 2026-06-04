import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gold and Grith | Crypto Intelligence Terminal',
  description: 'A SoSoValue-style crypto intelligence terminal for signals, liquidation risk, macro events, news, and SoDEX market data.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
