'use client';

import { AppShell } from '@/components/AppShell';
import { AppProvider } from '@/store/AppStore';

export default function Page() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
