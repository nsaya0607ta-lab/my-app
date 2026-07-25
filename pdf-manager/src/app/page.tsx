'use client';

import { AppShell } from '@/components/AppShell';
import { DeploymentTestFolder } from '@/components/DeploymentTestFolder';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { AppProvider } from '@/store/AppStore';

export default function Page() {
  return (
    <AppProvider>
      <ServiceWorkerUpdater />
      <DeploymentTestFolder />
      <AppShell />
    </AppProvider>
  );
}
