import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/space-grotesk';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gold & Grith | Operator Intelligence for SoDEX',
  description: 'Read live crypto market context, understand portfolio risk, and approve SoDEX actions from one focused operating view.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
