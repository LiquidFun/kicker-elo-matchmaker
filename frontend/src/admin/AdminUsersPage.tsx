import { FormEvent, useState } from 'react';

import {
  useCreateUser,
  useDeleteUser,
  useResetPasswordLink,
  useUsers,
} from '../api/hooks';
import type { User } from '../api/types';
import Avatar from '../match/Avatar';
import Modal from '../components/Modal';

export default function AdminUsersPage() {
  const usersQ = useUsers();
  const [createOpen, setCreateOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 p-3">
        <div className="text-sm text-white/60">{usersQ.data?.length ?? 0} users</div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-rail px-3 py-1.5 text-sm font-semibold text-pitch2"
        >
          + New user
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {usersQ.data?.map((u) => (
          <UserRow key={u.id} user={u} onLink={setLink} />
        ))}
      </div>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onLink={setLink}
      />

      <Modal open={link !== null} onClose={() => setLink(null)} title="Password set link">
        <p className="mb-2 text-sm text-white/70">
          Share this single-use link. It expires in 72 hours.
        </p>
        <textarea
          readOnly
          value={link ?? ''}
          rows={3}
          className="w-full rounded-lg bg-pitch2 p-2 text-sm font-mono outline-none ring-1 ring-white/10"
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => link && navigator.clipboard?.writeText(link)}
            className="flex-1 rounded-lg bg-rail py-2 font-semibold text-pitch2"
          >
            Copy
          </button>
          <button
            onClick={() => setLink(null)}
            className="flex-1 rounded-lg bg-pitch2 py-2 ring-1 ring-white/10"
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}

function UserRow({
  user,
  onLink,
}: {
  user: User;
  onLink: (url: string) => void;
}) {
  const del = useDeleteUser();
  const link = useResetPasswordLink();

  function onDelete() {
    if (!confirm(`Delete ${user.display_name}? Past matches will be preserved.`)) return;
    del.mutate(user.id);
  }

  function onResetLink() {
    link.mutate(user.id, {
      onSuccess: (data) => onLink(data.password_set_url),
    });
  }

  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-3 py-3">
      <Avatar user={user} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          {user.display_name}
          {user.role === 'admin' && (
            <span className="ml-2 rounded bg-rail/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-rail">
              admin
            </span>
          )}
          {!user.has_password && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-white/40">
              guest
            </span>
          )}
        </div>
        <div className="truncate text-xs text-white/40">
          @{user.username}
          {user.email && ` · ${user.email}`}
        </div>
      </div>
      <button
        onClick={onResetLink}
        disabled={link.isPending}
        className="rounded-md bg-pitch2 px-2 py-1 text-xs ring-1 ring-white/10 disabled:opacity-50"
      >
        {link.isPending ? '…' : user.has_password ? 'Reset' : 'Link'}
      </button>
      <button
        onClick={onDelete}
        disabled={del.isPending}
        className="rounded-md bg-pitch2 px-2 py-1 text-xs text-red-300 ring-1 ring-white/10 disabled:opacity-50"
      >
        ×
      </button>
    </div>
  );
}

function CreateUserModal({
  open,
  onClose,
  onLink,
}: {
  open: boolean;
  onClose: () => void;
  onLink: (url: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUser();

  function reset() {
    setUsername('');
    setDisplayName('');
    setEmail('');
    setPassword('');
    setRole('user');
    setError(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        username: username.trim(),
        display_name: displayName.trim() || username.trim(),
        email: email.trim() || undefined,
        password: password || undefined,
        role,
      },
      {
        onSuccess: (data) => {
          reset();
          onClose();
          if (data.password_set_url) onLink(data.password_set_url);
        },
        onError: (e) => setError(e.message),
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New user"
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Username (login id)">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input"
            autoCapitalize="off"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Display name (optional, defaults to username)">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Email (optional)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            autoComplete="off"
          />
        </Field>
        <Field label="Password (optional — leave blank to create a guest)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Role">
          <div className="flex rounded-lg bg-pitch2 p-0.5">
            <button
              type="button"
              onClick={() => setRole('user')}
              className={`flex-1 rounded-md py-1.5 text-sm ${
                role === 'user' ? 'bg-rail text-pitch2 font-semibold' : 'text-white/70'
              }`}
            >
              User
            </button>
            <button
              type="button"
              onClick={() => setRole('admin')}
              className={`flex-1 rounded-md py-1.5 text-sm ${
                role === 'admin' ? 'bg-rail text-pitch2 font-semibold' : 'text-white/70'
              }`}
            >
              Admin
            </button>
          </div>
        </Field>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-lg bg-rail py-2 font-semibold text-pitch2 disabled:opacity-50"
        >
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
      </form>
      <style>{`
        .input {
          width: 100%;
          background: #143020;
          color: white;
          border-radius: 8px;
          padding: 8px 12px;
          outline: none;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1);
        }
        .input:focus {
          box-shadow: inset 0 0 0 1px #c9a36c;
        }
      `}</style>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-white/60">{label}</span>
      {children}
    </label>
  );
}
