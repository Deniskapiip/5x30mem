import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Controllers Map MVP',
  description: 'Yandex Maps + Supabase realtime map for controllers'
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
