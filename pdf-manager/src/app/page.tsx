'use client';

import { AppShell } from '@/components/AppShell';
import { DeploymentTestFolder } from '@/components/DeploymentTestFolder';
import { FolderRuleRunner } from '@/components/FolderRuleRunner';
import { GeminiGeneratedPdfImporter } from '@/components/GeminiGeneratedPdfImporter';
import { GeminiWorkspace } from '@/components/gemini/GeminiWorkspace';
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
        <GeminiGeneratedPdfImporter />
        <AppShell />
        <GeminiWorkspace />
      </CloudProvider>
    </AppProvider>
  );
}
