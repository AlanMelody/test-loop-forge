import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { useApp } from '../state/AppContext';

export function ProtectedRoute() {
  const { user, ready } = useApp();
  const location = useLocation();

  if (!ready) {
    return <p role="status" className="route-loading">正在检查会话…</p>;
  }
  if (!user) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
