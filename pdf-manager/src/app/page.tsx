'use client';

import { AppShell } from '@/components/AppShell';
import { FolderRuleRunner } from '@/components/FolderRuleRunner';
import { GeminiGeneratedPdfImporter } from '@/components/GeminiGeneratedPdfImporter';
import { IonqReportImporter } from '@/components/IonqReportImporter';
import { ServiceWorkerUpdater } from '@/components/ServiceWorkerUpdater';
import { AppProvider } from '@/store/AppStore';
import { CloudProvider } from '@/store/CloudStore';
import { StockProvider } from '@/store/StockStore';

export default function Page() {
  return (
    <AppProvider>
      <CloudProvider>
        <StockProvider>
          <ServiceWorkerUpdater />
          <FolderRuleRunner />
          <IonqReportImporter />
          <GeminiGeneratedPdfImporter />
          {/* Geminiの資料作成画面は AppShell 内で設定画面から開く */}
          <AppShell />
        </StockProvider>
      </CloudProvider>
    </AppProvider>
  );
}
