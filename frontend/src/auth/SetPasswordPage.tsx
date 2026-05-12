import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useSetPassword } from '../api/hooks';

export default function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setPw = useSetPassword();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setPw.mutate(
      { token, new_password: password },
      { onError: (err) => setError(err.message) },
    );
  }

  if (!token) {
    return <div className="p-6 text-center text-white/70">Missing token.</div>;
  }

  if (setPw.isSuccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg">Password set.</p>
        <Link to="/login" className="rounded-lg bg-rail px-4 py-2 font-semibold text-pitch2">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-xs space-y-4 rounded-2xl bg-pitch p-6 shadow-2xl">
        <h1 className="text-center text-xl font-bold">Set your password</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          className="w-full rounded-lg bg-pitch2 px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-rail"
          autoFocus
          autoComplete="new-password"
        />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={setPw.isPending}
          className="w-full rounded-lg bg-rail py-2 font-semibold text-pitch2 disabled:opacity-50"
        >
          {setPw.isPending ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  );
}
