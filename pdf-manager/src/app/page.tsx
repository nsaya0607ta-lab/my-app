'use client';

import { AppShell } from '@/components/AppShell';
import { DeploymentTestFolder } from '@/components/DeploymentTestFolder';
import { FolderRuleRunner } from '@/components/FolderRuleRunner';
import { IonqReportImporter } from '@/components/IonqReportImporter';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { AppProvider } from '@/store/AppStore';
import { CloudProvider } from '@/store/CloudStore';

export default function Page() {
  return (
    <AppProvider>
      <CloudProvider>
        <ServiceWorkerUpdater />
        <DeploymentTestFolder />
        <FolderRuleRunner />
        <IonqReportImporter />
        <AppShell />
      </CloudProvider>
    </AppProvider>
  );
}
