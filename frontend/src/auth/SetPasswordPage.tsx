import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { usePasswordTokenLookup, useSetPassword } from '../api/hooks';
import Avatar from '../match/Avatar';

export default function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const lookup = usePasswordTokenLookup(token || null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setPw = useSetPassword();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }
    setPw.mutate(
      { token, new_password: password },
      { onError: (err) => setError(err.message) },
    );
  }

  if (!token) {
    return <div className="p-6 text-center text-ink2">Kein Token.</div>;
  }

  if (setPw.isSuccess) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-lg">Passwort gespeichert.</p>
        <Link to="/login" className="rounded-lg bg-pitch px-4 py-2 font-semibold text-white">
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-xs space-y-4 rounded-2xl bg-surface p-6 shadow-lg ring-1 ring-line"
      >
        <h1 className="text-center text-xl font-bold text-pitch">Passwort festlegen</h1>

        {lookup.isLoading && (
          <p className="text-center text-sm text-ink2">Lädt …</p>
        )}
        {lookup.isError && (
          <p className="text-center text-sm text-red-600">
            Dieser Link ist ungültig oder abgelaufen.
          </p>
        )}
        {lookup.data && (
          <div className="flex items-center gap-3 rounded-xl bg-paper p-3 ring-1 ring-line">
            <Avatar user={lookup.data} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">
                {lookup.data.display_name}
              </div>
              <div className="truncate text-xs text-ink2">@{lookup.data.username}</div>
            </div>
          </div>
        )}

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Neues Passwort"
          className="w-full rounded-lg bg-paper px-3 py-2 text-ink outline-none ring-1 ring-line focus:ring-pitch"
          autoFocus
          autoComplete="new-password"
          disabled={!lookup.data}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={setPw.isPending || !lookup.data}
          className="w-full rounded-lg bg-pitch py-2 font-semibold text-white disabled:opacity-50"
        >
          {setPw.isPending ? 'Speichert …' : 'Passwort speichern'}
        </button>
      </form>
    </div>
  );
}
