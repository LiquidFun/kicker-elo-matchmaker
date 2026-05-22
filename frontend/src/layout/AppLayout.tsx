import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { getOrgOverride, onOrgOverrideChange, setOrgOverride } from '../api/client';
import { useOrganizations } from '../api/hooks';
import type { User } from '../api/types';

export default function AppLayout({ user }: { user: User | null }) {
  const navItem =
    'flex-1 py-3 text-center text-sm font-medium border-t-2 border-transparent';
  const navActive = 'border-pitch text-ink';
  const navInactive = 'text-ink2';

  const isAdmin = user?.role === 'admin';
  const [override, setOverride] = useState(getOrgOverride());
  useEffect(() => onOrgOverrideChange(() => setOverride(getOrgOverride())), []);
  const orgsQ = useOrganizations(isAdmin ?? false);
  const overrideOrg = isAdmin && override ? orgsQ.data?.find((o) => o.id === override) : null;

  return (
    <div className="flex h-full flex-col">
      {overrideOrg && (
        <div className="flex items-center justify-between bg-accent px-3 py-1.5 text-xs text-white">
          <span>
            Org-Kontext: <span className="font-semibold">{overrideOrg.name}</span>
          </span>
          <button
            onClick={() => { setOrgOverride(null); window.location.reload(); }}
            className="rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
          >
            Zurück zu meiner Org
          </button>
        </div>
      )}
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
        {user && (user.role === 'admin' || user.role === 'moderator') && (
          <NavLink
            to="/admin/users"
            className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
          >
            Verwaltung
          </NavLink>
        )}
        {user ? (
          <NavLink
            to={`/stats/users/${user.id}`}
            className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
          >
            {user.name.split(' ')[0]}
          </NavLink>
        ) : (
          <NavLink
            to="/login"
            className={({ isActive }) => `${navItem} ${isActive ? navActive : navInactive}`}
          >
            Anmelden
          </NavLink>
        )}
      </nav>
    </div>
  );
}
