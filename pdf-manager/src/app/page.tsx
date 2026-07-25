'use client';

import { AppShell } from '@/components/AppShell';
import { CloudBackupAgent } from '@/components/cloud/CloudBackupAgent';
import { CloudBackupMount } from '@/components/cloud/CloudBackupMount';
import { DeploymentTestFolder } from '@/components/DeploymentTestFolder';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { AppProvider } from '@/store/AppStore';

export default function Page() {
  return (
    <AppProvider>
      <ServiceWorkerUpdater />
      <DeploymentTestFolder />
      <CloudBackupAgent />
      <AppShell />
      <CloudBackupMount />
    </AppProvider>
  );
}
