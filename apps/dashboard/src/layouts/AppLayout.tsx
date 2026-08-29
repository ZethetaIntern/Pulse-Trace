import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-full bg-canvas">
      <Sidebar />
      <div className="min-w-0 flex-1 overflow-auto">
        <main className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}