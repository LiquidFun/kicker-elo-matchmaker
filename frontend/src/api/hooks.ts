import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './client';
import type {
  BalanceResult,
  GlobalStats,
  LeaderboardMode,
  Match,
  MatchPlayerInput,
  Mode,
  PreviewResult,
  Settings,
  User,
  UserCreateResult,
  UserStats,
} from './types';

export const useMe = () =>
  useQuery<User | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<User>('/api/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; password: string }) =>
      api.post<User>('/api/auth/login', vars),
    onSuccess: (user) => qc.setQueryData(['me'], user),
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>('/api/auth/logout'),
    onSuccess: () => {
      qc.setQueryData(['me'], null);
      qc.invalidateQueries();
    },
  });
};

export const useUsers = () =>
  useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/api/users'),
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      name: string;
      avatar_url?: string;
      role?: 'admin' | 'user';
      password?: string;
    }) => api.post<UserCreateResult>('/api/users', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useDeleteUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number } & Partial<Pick<User, 'name' | 'avatar_url' | 'role'>>) =>
      api.patch<User>(`/api/users/${vars.id}`, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useResetPasswordLink = () =>
  useMutation({
    mutationFn: (id: number) =>
      api.post<{ password_set_url: string }>(`/api/users/${id}/password-link`),
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: (vars: { id: number; current_password?: string; new_password: string }) =>
      api.post<{ ok: boolean }>(`/api/users/${vars.id}/password`, {
        current_password: vars.current_password,
        new_password: vars.new_password,
      }),
  });

export const useUploadAvatar = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: number; file: File }) => {
      const fd = new FormData();
      fd.append('file', vars.file);
      return api.postForm<User>(`/api/users/${vars.id}/avatar`, fd);
    },
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.setQueryData(['me'], (prev: User | null | undefined) =>
        prev && prev.id === user.id ? user : prev,
      );
    },
  });
};

export const useSetPassword = () =>
  useMutation({
    mutationFn: (vars: { token: string; new_password: string }) =>
      api.post<{ ok: boolean }>('/api/password/set', vars),
  });

export const usePasswordTokenLookup = (token: string | null) =>
  useQuery({
    queryKey: ['password-lookup', token],
    queryFn: () =>
      api.get<User>(`/api/password/lookup?token=${encodeURIComponent(token!)}`),
    enabled: !!token,
    retry: false,
  });

export const useMatches = (userId?: number, limit = 50) =>
  useQuery({
    queryKey: ['matches', { userId, limit }],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (userId) qs.set('user_id', String(userId));
      return api.get<Match[]>(`/api/matches?${qs.toString()}`);
    },
  });

export const useCreateMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      mode: Mode;
      goals_to_win: number;
      team1_score: number;
      team2_score: number;
      players: MatchPlayerInput[];
    }) => api.post<Match>('/api/matches', vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
};

export const useBalance = () =>
  useMutation({
    mutationFn: (vars: { player_ids: number[] }) =>
      api.post<BalanceResult>('/api/balance', vars),
  });

export const usePreview = () =>
  useMutation({
    mutationFn: (vars: { mode: Mode; goals_to_win: number; players: MatchPlayerInput[] }) =>
      api.post<PreviewResult>('/api/preview', vars),
  });

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Settings>('/api/settings'),
  });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { default_goals_to_win: number }) =>
      api.put<Settings>('/api/settings', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
};

export const useLeaderboard = (mode: LeaderboardMode) =>
  useQuery({
    queryKey: ['leaderboard', mode],
    queryFn: () => api.get<User[]>(`/api/stats/leaderboard?mode=${mode}`),
  });

export const useUserStats = (userId: number) =>
  useQuery({
    queryKey: ['user-stats', userId],
    queryFn: () => api.get<UserStats>(`/api/stats/users/${userId}`),
  });

export const useGlobalStats = () =>
  useQuery({
    queryKey: ['global-stats'],
    queryFn: () => api.get<GlobalStats>('/api/stats/global'),
  });
