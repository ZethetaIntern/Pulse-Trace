import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { OverviewPage } from './pages/OverviewPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { NotificationDetailPage } from './pages/NotificationDetailPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { MonitoringPage } from './pages/MonitoringPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="notifications/:notificationId" element={<NotificationDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
      </Route>
    </Routes>
  );
}
