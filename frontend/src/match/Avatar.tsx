import type { User } from '../api/types';

const COLORS = [
  '#5b8def', '#7c5bef', '#ef5b8d', '#ef5b5b', '#ef8d5b',
  '#efc25b', '#a3ef5b', '#5bef8d', '#5befcc', '#5bccef',
];

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  user,
  size = 'md',
  className = '',
}: {
  user: Pick<User, 'display_name' | 'avatar_url' | 'username'>;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.display_name}
        className={`${dim} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${dim} flex items-center justify-center rounded-full font-semibold text-pitch2 ${className}`}
      style={{ background: hashColor(user.username) }}
    >
      {initials(user.display_name)}
    </div>
  );
}
