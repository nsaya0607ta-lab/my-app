'use client';

import { AppShell } from '@/components/AppShell';
import { DeploymentTestFolder } from '@/components/DeploymentTestFolder';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { AppProvider } from '@/store/AppStore';
import { CloudProvider } from '@/store/CloudStore';

export default function Page() {
  return (
    <AppProvider>
      <CloudProvider>
        <ServiceWorkerUpdater />
        <DeploymentTestFolder />
        <AppShell />
      </CloudProvider>
    </AppProvider>
  );
}
