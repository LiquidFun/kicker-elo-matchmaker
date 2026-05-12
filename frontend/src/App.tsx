import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useMe } from './api/hooks';
import LoginPage from './auth/LoginPage';
import SetPasswordPage from './auth/SetPasswordPage';
import AppLayout from './layout/AppLayout';
import MatchBuilderPage from './match/MatchBuilderPage';
import StatsPage from './stats/StatsPage';
import UserProfilePage from './stats/UserProfilePage';
import AdminUsersPage from './admin/AdminUsersPage';

export default function App() {
  const me = useMe();
  const location = useLocation();

  if (me.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-white/70">Loading…</div>
    );
  }

  const isPublic = location.pathname === '/login' || location.pathname.startsWith('/set-password');
  const user = me.data ?? null;

  if (!user && !isPublic) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/" element={<AppLayout user={user!} />}>
        <Route index element={<MatchBuilderPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="stats/users/:userId" element={<UserProfilePage />} />
        {user?.role === 'admin' && <Route path="admin/users" element={<AdminUsersPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
