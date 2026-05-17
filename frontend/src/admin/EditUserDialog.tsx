import { FormEvent, useRef, useState } from 'react';

import { useChangePassword, useMe, useUpdateUser, useUploadAvatar } from '../api/hooks';
import type { User } from '../api/types';
import Avatar from '../match/Avatar';
import Modal from '../components/Modal';

export default function EditUserDialog({
  open,
  onClose,
  user,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  isAdmin: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Profil bearbeiten">
      <div className="space-y-5">
        <AvatarSection user={user} />
        <NameSection user={user} canEdit={isAdmin} />
        {isAdmin && <RoleSection user={user} />}
        <PasswordSection user={user} requireCurrent={!isAdmin} />
      </div>
    </Modal>
  );
}

function RoleSection({ user }: { user: User }) {
  const me = useMe();
  const update = useUpdateUser();
  const isSelf = me.data?.id === user.id;

  function onToggle() {
    const next = user.role === 'admin' ? 'user' : 'admin';
    if (next === 'user' && isSelf) {
      if (!confirm('Eigene Admin-Rechte wirklich entziehen?')) return;
    }
    update.mutate({ id: user.id, role: next });
  }

  return (
    <div>
      <div className="mb-1 text-xs text-ink2">Rolle</div>
      <div className="flex items-center gap-3">
        <span className="text-sm">
          {user.role === 'admin' ? 'Admin' : 'Benutzer'}
        </span>
        <button
          type="button"
          onClick={onToggle}
          disabled={update.isPending}
          className="rounded-md bg-paper px-2 py-1 text-xs text-ink ring-1 ring-line disabled:opacity-50"
        >
          {update.isPending
            ? '…'
            : user.role === 'admin'
              ? '↓ Zu Benutzer'
              : '↑ Zu Admin'}
        </button>
      </div>
    </div>
  );
}

function AvatarSection({ user }: { user: User }) {
  const upload = useUploadAvatar();
  const update = useUpdateUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    upload.mutate(
      { id: user.id, file },
      { onError: (err) => setError(err.message) },
    );
    e.target.value = '';
  }

  function onRemove() {
    update.mutate({ id: user.id, avatar_url: null });
  }

  return (
    <div>
      <div className="mb-1 text-xs text-ink2">Profilbild</div>
      <div className="flex items-center gap-3">
        <Avatar user={user} size="lg" />
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            className="rounded-lg bg-pitch px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {upload.isPending ? '…' : 'Hochladen'}
          </button>
          {user.avatar_url && (
            <button
              type="button"
              onClick={onRemove}
              disabled={update.isPending}
              className="rounded-lg bg-surface px-3 py-1.5 text-sm text-ink2 ring-1 ring-line disabled:opacity-50"
            >
              Entfernen
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onPick}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function NameSection({ user, canEdit }: { user: User; canEdit: boolean }) {
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateUser();

  function onSave() {
    if (!canEdit || name.trim() === user.name) return;
    setError(null);
    update.mutate(
      { id: user.id, name: name.trim() },
      { onError: (err) => setError(err.message) },
    );
  }

  return (
    <div>
      <div className="mb-1 text-xs text-ink2">Name</div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
          className="flex-1 rounded-lg bg-paper px-3 py-2 text-ink outline-none ring-1 ring-line focus:ring-pitch disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink2"
        />
        {canEdit && (
          <button
            type="button"
            onClick={onSave}
            disabled={update.isPending || name.trim() === user.name || !name.trim()}
            className="rounded-lg bg-pitch px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {update.isPending ? '…' : 'Speichern'}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function PasswordSection({
  user,
  requireCurrent,
}: {
  user: User;
  requireCurrent: boolean;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const change = useChangePassword();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (next.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }
    change.mutate(
      {
        id: user.id,
        current_password: requireCurrent ? current : undefined,
        new_password: next,
      },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setOk(true);
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="text-xs text-ink2">Passwort ändern</div>
      {requireCurrent && (
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Aktuelles Passwort"
          autoComplete="current-password"
          className="w-full rounded-lg bg-paper px-3 py-2 text-ink outline-none ring-1 ring-line focus:ring-pitch"
        />
      )}
      <input
        type="password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="Neues Passwort"
        autoComplete="new-password"
        className="w-full rounded-lg bg-paper px-3 py-2 text-ink outline-none ring-1 ring-line focus:ring-pitch"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {ok && <p className="text-xs text-pitch">Passwort gespeichert.</p>}
      <button
        type="submit"
        disabled={change.isPending || !next}
        className="w-full rounded-lg bg-pitch py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {change.isPending ? '…' : 'Passwort ändern'}
      </button>
    </form>
  );
}
