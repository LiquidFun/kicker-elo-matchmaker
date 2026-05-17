import { NavLink, Outlet } from 'react-router-dom';

import { useLogout } from '../api/hooks';
import type { User } from '../api/types';

export default function AppLayout({ user }: { user: User }) {
  const logout = useLogout();

  const navItem =
    'flex-1 py-3 text-center text-sm font-medium border-t-2 border-transparent';
  const navActive = 'border-pitch text-ink';
  const navInactive = 'text-ink2';

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <nav className="flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
        >
          Spiel
        </NavLink>
        <NavLink
          to="/stats"
          className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
        >
          Statistik
        </NavLink>
        <NavLink
          to="/admin/users"
          className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
        >
          Verwaltung
        </NavLink>
        <button
          onClick={() => logout.mutate()}
          className={`${navItem} ${navInactive}`}
          aria-label="Abmelden"
        >
          {user.name.split(' ')[0]} ↗
        </button>
      </nav>
    </div>
  );
}
