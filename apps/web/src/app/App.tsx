import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BookPage } from '@/features/book/BookPage';
import { DataQualityPage } from '@/features/dataQuality/DataQualityPage';
import { Client360Page } from '@/features/client360/Client360Page';
import { ImpactPage } from '@/features/impact/ImpactPage';
import { RiskActionsPage } from '@/features/risk/RiskActionsPage';
import { TradeIdeasPage } from '@/features/risk/TradeIdeasPage';
import { RubricPage } from '@/features/rubric/RubricPage';
import { SignalsPage } from '@/features/signals/SignalsPage';
import { CashflowsTab } from '@/features/portfolio/CashflowsTab';
import { ExposureTab } from '@/features/portfolio/ExposureTab';
import { HoldingsTab } from '@/features/portfolio/HoldingsTab';
import { OverviewTab } from '@/features/portfolio/OverviewTab';
import { PortfolioPage } from '@/features/portfolio/PortfolioPage';
import { TransactionsTab } from '@/features/portfolio/TransactionsTab';
import { VectorPage } from '@/features/vector/VectorPage';
import { AppShell } from './shell/AppShell';
import { DefaultClientRedirect } from './shell/DefaultClientRedirect';
import { PlaceholderPage } from './shell/PlaceholderPage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/book" replace />} />
        <Route path="/book" element={<BookPage />} />
        <Route path="/signals" element={<SignalsPage />} />
        <Route
          path="/impact"
          element={<DefaultClientRedirect to={(id) => `/clients/${id}/impact`} />}
        />
        <Route path="/clients/:clientId/impact" element={<ImpactPage />} />
        <Route
          path="/rubric"
          element={<DefaultClientRedirect to={(id) => `/clients/${id}/rubric`} />}
        />
        <Route path="/clients/:clientId/rubric" element={<RubricPage />} />
        <Route
          path="/actions"
          element={<DefaultClientRedirect to={(id) => `/clients/${id}/actions`} />}
        />
        <Route path="/clients/:clientId/actions" element={<RiskActionsPage />} />
        <Route
          path="/trade-ideas"
          element={<DefaultClientRedirect to={(id) => `/clients/${id}/trade-ideas`} />}
        />
        <Route path="/clients/:clientId/trade-ideas" element={<TradeIdeasPage />} />
        <Route path="/clients/:clientId" element={<Client360Page />} />
        <Route path="/clients/:clientId/portfolio" element={<PortfolioPage />}>
          <Route index element={<OverviewTab />} />
          <Route path="holdings" element={<HoldingsTab />} />
          <Route path="exposure" element={<ExposureTab />} />
          <Route path="transactions" element={<TransactionsTab />} />
          <Route path="cashflows" element={<CashflowsTab />} />
        </Route>
        <Route path="/client" element={<DefaultClientRedirect to={(id) => `/clients/${id}`} />} />
        <Route
          path="/portfolio"
          element={<DefaultClientRedirect to={(id) => `/clients/${id}/portfolio`} />}
        />
        <Route path="/clients/:clientId/vector" element={<VectorPage />} />
        <Route
          path="/vector"
          element={<DefaultClientRedirect to={(id) => `/clients/${id}/vector`} />}
        />
        <Route path="/audit" element={<DataQualityPage />} />
        <Route path="*" element={<PlaceholderPage title="Not found" />} />
      </Route>
    </Routes>
  );
}
