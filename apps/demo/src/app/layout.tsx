import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Amalthea',
  description: 'A meal-planning assistant that interviews first and plans second.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        {children}
      </body>
    </html>
  );
}
