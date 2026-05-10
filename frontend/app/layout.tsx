import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sentinel Finance | Institutional Grade Intelligence',
  description: 'A cinematic command center for high-velocity crypto intelligence. Leverage institutional-grade narrative scanning and algorithmic protection.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
