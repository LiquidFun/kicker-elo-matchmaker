import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { useLogin, useMe } from '../api/hooks';

export default function LoginPage() {
  const me = useMe();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();

  if (me.data) return <Navigate to="/" replace />;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    login.mutate(
      { username, password },
      { onError: (err) => setError(err.message) },
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xs space-y-4 rounded-2xl bg-pitch p-6 shadow-2xl"
      >
        <h1 className="text-center text-2xl font-bold">Kicker</h1>
        <div>
          <label className="mb-1 block text-sm text-white/70">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg bg-pitch2 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-rail"
            autoComplete="username"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-white/70">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-pitch2 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-rail"
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-lg bg-rail py-2 font-semibold text-pitch2 disabled:opacity-50"
        >
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
