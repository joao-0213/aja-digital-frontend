import { type Metadata } from 'next';
import { type ReactNode } from 'react';
import './globals.css';
import { Providers } from '@/components/providers';
import { AppShell } from '@/components/layout/app-shell';

export const metadata: Metadata = {
  title: {
    default: 'AJA Digital · Portal acadêmico',
    template: '%s · AJA Digital'
  },
  description: 'Demonstração frontend do Cursinho Solidário AJA. Disciplinas, trilhas, avaliações e comunidade.',
  icons: {
    icon: '/favicon.svg'
  }
};

export default function RootLayout({
  children
}: {
  children: ReactNode;
}) {
  return <html lang="pt-BR">
    <body>
      <Providers>
        <AppShell>
          {children}
        </AppShell>
      </Providers>
    </body>
  </html>;
}
