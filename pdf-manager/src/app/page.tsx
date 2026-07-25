'use client';

import { AppShell } from '@/components/AppShell';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { AppProvider } from '@/store/AppStore';

export default function Page() {
  return (
    <AppProvider>
      <ServiceWorkerUpdater />
      <AppShell />
    </AppProvider>
  );
}
