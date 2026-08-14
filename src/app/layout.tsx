import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Internal Tools Platform',
  description: 'KYC review, refunds and feature flags on one thin in-house platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-sm">{children}</body>
    </html>
  );
}
