import { NavLink, Outlet } from 'react-router-dom';

import { useLogout } from '../api/hooks';
import type { User } from '../api/types';

export default function AppLayout({ user }: { user: User }) {
  const logout = useLogout();

  const navItem =
    'flex-1 py-3 text-center text-sm font-medium border-t-2 border-transparent';
  const navActive = 'border-rail text-white';
  const navInactive = 'text-white/60';

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <nav className="flex border-t border-white/10 bg-pitch2 pb-[env(safe-area-inset-bottom)]">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
        >
          Match
        </NavLink>
        <NavLink
          to="/stats"
          className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
        >
          Stats
        </NavLink>
        {user.role === 'admin' && (
          <NavLink
            to="/admin/users"
            className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
          >
            Admin
          </NavLink>
        )}
        <button
          onClick={() => logout.mutate()}
          className={`${navItem} ${navInactive}`}
          aria-label="Sign out"
        >
          {user.display_name.split(' ')[0]} ↗
        </button>
      </nav>
    </div>
  );
}
