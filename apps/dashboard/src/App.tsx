import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { OverviewPage } from './pages/OverviewPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { NotificationDetailPage } from './pages/NotificationDetailPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="notifications/:notificationId" element={<NotificationDetailPage />} />
      </Route>
    </Routes>
  );
}
