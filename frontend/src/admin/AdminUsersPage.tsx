import { FormEvent, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import {
  useCanManage,
  useCreateOrganization,
  useCreateUser,
  useCurrentOrganization,
  useDeleteOrganization,
  useDeleteUser,
  useMe,
  useOrganizations,
  useResetPasswordLink,
  useUpdateOrganization,
  useUsers,
} from '../api/hooks';
import { getOrgOverride, setOrgOverride } from '../api/client';
import type { Role, User } from '../api/types';
import Avatar from '../match/Avatar';
import Modal from '../components/Modal';
import EditUserDialog from './EditUserDialog';

export default function AdminUsersPage() {
  const usersQ = useUsers();
  const me = useMe();
  const qc = useQueryClient();
  const isAdmin = me.data?.role === 'admin';
  const canManage = useCanManage();
  const currentOrgQ = useCurrentOrganization();
  const orgsQ = useOrganizations(!!isAdmin);
  const [createOpen, setCreateOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = usersQ.data?.find((u) => u.id === editingId) ?? null;

  function switchOrg(orgId: number | null) {
    setOrgOverride(orgId);
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['matches'] });
  }

  const orgName = getOrgOverride()
    ? orgsQ.data?.find((o) => o.id === getOrgOverride())?.name
    : currentOrgQ.data?.name;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-hidden">
      {/* Org header */}
      <div className="border-b border-line bg-paper px-3 py-2">
        {isAdmin && orgsQ.data ? (
          <OrgBar
            orgs={orgsQ.data}
            currentOrgId={getOrgOverride() ?? me.data?.organization_id ?? 1}
            ownOrgId={me.data?.organization_id ?? 1}
            onSwitch={switchOrg}
          />
        ) : (
          <div className="text-sm text-ink2">
            Organisation: <span className="font-medium text-ink">{orgName ?? '…'}</span>
          </div>
        )}
      </div>

      {/* User list header */}
      <div className="flex items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2">
        <span className="text-sm text-ink2">{usersQ.data?.length ?? 0} Benutzer</span>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-pitch px-3 py-1.5 text-sm font-semibold text-white"
          >
            + Neuer Benutzer
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {usersQ.data?.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            onLink={setLink}
            onEdit={() => setEditingId(u.id)}
          />
        ))}
      </div>

      {canManage && (
        <CreateUserModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onLink={setLink}
          actorRole={me.data?.role ?? 'user'}
        />
      )}

      {editing && (
        <EditUserDialog
          open
          onClose={() => setEditingId(null)}
          user={editing}
          canManage={canManage}
          actorRole={me.data?.role ?? 'user'}
        />
      )}

      <Modal open={link !== null} onClose={() => setLink(null)} title="Passwort-Link">
        <p className="mb-2 text-sm text-ink2">
          Diesen einmaligen Link teilen. Gültig 72 Stunden.
        </p>
        <textarea
          readOnly
          value={link ?? ''}
          rows={3}
          className="w-full rounded-lg bg-paper p-2 text-sm font-mono text-ink outline-none ring-1 ring-line"
          onFocus={(e) => e.currentTarget.select()}
        />
        <ShareButtons link={link} onClose={() => setLink(null)} />
      </Modal>
    </div>
  );
}

function UserRow({
  user,
  onLink,
  onEdit,
}: {
  user: User;
  onLink: (url: string) => void;
  onEdit: () => void;
}) {
  const me = useMe();
  const del = useDeleteUser();
  const link = useResetPasswordLink();
  const canManage = useCanManage();
  const isSelf = me.data?.id === user.id;
  const canEdit = canManage || isSelf;

  function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`${user.name} löschen? Vergangene Spiele bleiben erhalten.`)) return;
    del.mutate(user.id);
  }

  function onResetLink(e: React.MouseEvent) {
    e.stopPropagation();
    link.mutate(user.id, {
      onSuccess: (data) => onLink(data.password_set_url),
    });
  }

  return (
    <div
      className={`flex items-center gap-3 border-b border-line bg-surface px-3 py-3 ${
        canEdit ? 'cursor-pointer' : ''
      }`}
      onClick={canEdit ? onEdit : undefined}
    >
      <Avatar user={user} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          {user.name}
          {user.role === 'admin' && (
            <span className="ml-2 rounded bg-pitch px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              admin
            </span>
          )}
          {user.role === 'moderator' && (
            <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              mod
            </span>
          )}
          {!user.has_password && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-ink2">
              gast
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="rounded-md bg-paper p-1.5 text-ink ring-1 ring-line"
          aria-label="Bearbeiten"
          title="Bearbeiten"
        >
          <PencilIcon />
        </button>
      )}
      {canManage && (
        <>
          <button
            onClick={onResetLink}
            disabled={link.isPending}
            className="rounded-md bg-paper px-2 py-1 text-xs text-ink ring-1 ring-line disabled:opacity-50"
          >
            {link.isPending ? '…' : user.has_password ? 'Zurücks.' : 'Link'}
          </button>
          <button
            onClick={onDelete}
            disabled={del.isPending || isSelf}
            className="rounded-md bg-paper px-2 py-1 text-xs text-red-600 ring-1 ring-line disabled:opacity-50"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CreateUserModal({
  open,
  onClose,
  onLink,
  actorRole,
}: {
  open: boolean;
  onClose: () => void;
  onLink: (url: string) => void;
  actorRole: Role;
}) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateUser();

  function reset() {
    setName('');
    setPassword('');
    setRole('user');
    setError(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        name: name.trim(),
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
      title="Neuer Benutzer"
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Passwort (optional — leer = Gast)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="new-password"
          />
        </Field>
        <Field label="Rolle">
          <div className="flex rounded-lg bg-paper p-0.5 ring-1 ring-line">
            <button
              type="button"
              onClick={() => setRole('user')}
              className={`flex-1 rounded-md py-1.5 text-sm ${
                role === 'user' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
              }`}
            >
              Benutzer
            </button>
            <button
              type="button"
              onClick={() => setRole('moderator')}
              className={`flex-1 rounded-md py-1.5 text-sm ${
                role === 'moderator' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
              }`}
            >
              Moderator
            </button>
            {actorRole === 'admin' && (
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`flex-1 rounded-md py-1.5 text-sm ${
                  role === 'admin' ? 'bg-pitch text-white font-semibold' : 'text-ink2'
                }`}
              >
                Admin
              </button>
            )}
          </div>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={create.isPending}
          className="w-full rounded-lg bg-pitch py-2 font-semibold text-white disabled:opacity-50"
        >
          {create.isPending ? 'Erstellt …' : 'Erstellen'}
        </button>
      </form>
      <style>{`
        .input {
          width: 100%;
          background: rgb(var(--c-paper));
          color: rgb(var(--c-ink));
          border-radius: 8px;
          padding: 8px 12px;
          outline: none;
          box-shadow: inset 0 0 0 1px rgb(var(--c-line));
        }
        .input:focus {
          box-shadow: inset 0 0 0 1px rgb(var(--c-pitch));
        }
      `}</style>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-ink2">{label}</span>
      {children}
    </label>
  );
}

function OrgBar({
  orgs,
  currentOrgId,
  ownOrgId,
  onSwitch,
}: {
  orgs: { id: number; name: string }[];
  currentOrgId: number;
  ownOrgId: number;
  onSwitch: (orgId: number | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const deleteOrg = useDeleteOrganization();

  const currentOrg = orgs.find((o) => o.id === currentOrgId);

  function onAdd(e: FormEvent) {
    e.preventDefault();
    createOrg.mutate(
      { name: newName.trim() },
      {
        onSuccess: () => {
          setNewName('');
          setAdding(false);
        },
      },
    );
  }

  function onRename(e: FormEvent) {
    e.preventDefault();
    updateOrg.mutate(
      { id: currentOrgId, name: editName.trim() },
      { onSuccess: () => setEditing(false) },
    );
  }

  function startEditing() {
    setEditName(currentOrg?.name ?? '');
    setEditing(true);
    setAdding(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-ink2">Organisation:</span>
        <select
          value={currentOrgId}
          onChange={(e) => {
            const v = Number(e.target.value);
            onSwitch(v === ownOrgId ? null : v);
          }}
          className="flex-1 rounded-lg bg-surface px-2 py-1.5 text-sm text-ink ring-1 ring-line"
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={startEditing}
          className="rounded-lg bg-surface px-2 py-1.5 text-xs text-ink ring-1 ring-line"
          title="Umbenennen"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={() => { setAdding(!adding); setEditing(false); }}
          className="rounded-lg bg-pitch px-2 py-1.5 text-xs font-semibold text-white"
          title="Neue Organisation"
        >
          +
        </button>
        {currentOrgId !== 1 && (
          <button
            type="button"
            onClick={() => {
              if (!confirm('Organisation löschen?')) return;
              deleteOrg.mutate(currentOrgId, {
                onSuccess: () => onSwitch(null),
              });
            }}
            disabled={deleteOrg.isPending}
            className="rounded-lg bg-surface px-2 py-1.5 text-xs text-accent ring-1 ring-line disabled:opacity-50"
            title="Löschen"
          >
            ✕
          </button>
        )}
      </div>
      {adding && (
        <form onSubmit={onAdd} className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name der neuen Organisation"
            required
            className="flex-1 rounded-lg bg-surface px-2 py-1.5 text-sm outline-none ring-1 ring-line focus:ring-pitch"
          />
          <button
            type="submit"
            disabled={createOrg.isPending}
            className="rounded-lg bg-pitch px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {createOrg.isPending ? '…' : 'Erstellen'}
          </button>
        </form>
      )}
      {editing && (
        <form onSubmit={onRename} className="flex items-center gap-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
            className="flex-1 rounded-lg bg-surface px-2 py-1.5 text-sm outline-none ring-1 ring-line focus:ring-pitch"
          />
          <button
            type="submit"
            disabled={updateOrg.isPending || editName.trim() === currentOrg?.name}
            className="rounded-lg bg-pitch px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {updateOrg.isPending ? '…' : 'Speichern'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg bg-surface px-2 py-1.5 text-xs text-ink2 ring-1 ring-line"
          >
            Abbrechen
          </button>
        </form>
      )}
    </div>
  );
}

function ShareButtons({ link, onClose }: { link: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function';

  async function onCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function onShare() {
    if (!link) return;
    try {
      await navigator.share({
        title: 'Kicker — Passwort festlegen',
        text: 'Passwort für Kicker festlegen:',
        url: link,
      });
    } catch {
      // user cancelled — ignore
    }
  }

  return (
    <div className="mt-3 flex gap-2">
      {canShare && (
        <button
          onClick={onShare}
          className="flex-1 rounded-lg bg-pitch py-2 font-semibold text-white"
        >
          Teilen
        </button>
      )}
      <button
        onClick={onCopy}
        className={`flex-1 rounded-lg py-2 font-semibold ${
          canShare
            ? 'bg-surface text-ink ring-1 ring-line'
            : 'bg-pitch text-white'
        }`}
      >
        {copied ? 'Kopiert ✓' : 'Kopieren'}
      </button>
      <button
        onClick={onClose}
        className="rounded-lg bg-surface px-4 py-2 text-ink ring-1 ring-line"
        aria-label="Schließen"
      >
        ✕
      </button>
    </div>
  );
}
