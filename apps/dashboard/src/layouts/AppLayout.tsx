import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-full bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <main className="mx-auto max-w-7xl px-6 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
