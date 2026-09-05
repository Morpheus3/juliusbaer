import type { JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BookPage } from '@/features/book/BookPage';
import { DataQualityPage } from '@/features/dataQuality/DataQualityPage';
import { AppShell } from './shell/AppShell';
import { PlaceholderPage } from './shell/PlaceholderPage';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/book" replace />} />
        <Route path="/book" element={<BookPage />} />
        <Route path="/signals" element={<PlaceholderPage title="Market signals" iteration={3} />} />
        <Route path="/impact" element={<PlaceholderPage title="Signal impact" iteration={3} />} />
        <Route
          path="/rubric"
          element={<PlaceholderPage title="Customer risk rubric" iteration={4} />}
        />
        <Route
          path="/actions"
          element={<PlaceholderPage title="Combined risk and actions" iteration={5} />}
        />
        <Route
          path="/clients/:clientId"
          element={<PlaceholderPage title="Client 360" iteration={2} />}
        />
        <Route path="/audit" element={<DataQualityPage />} />
        <Route path="*" element={<PlaceholderPage title="Not found" />} />
      </Route>
    </Routes>
  );
}
