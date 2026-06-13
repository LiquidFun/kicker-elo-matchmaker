import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './client';
import type {
  AppConfig,
  BalanceResult,
  TwoVsOneBalanceResult,
  GlobalStats,
  LeaderboardMode,
  Match,
  MatchList,
  MatchPlayerInput,
  Mode,
  Organization,
  PreviewResult,
  Role,
  Settings,
  User,
  UserCreateResult,
  UserStats,
} from './types';

export const useAppConfig = () =>
  useQuery<AppConfig>({
    queryKey: ['app-config'],
    queryFn: () => api.get<AppConfig>('/api/config'),
    staleTime: Infinity,
  });

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
      role?: Role;
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

export const useDeleteMatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/matches/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matches'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
};

export const useUpdateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number } & Partial<Pick<User, 'name' | 'role'>>) =>
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

export const useDeleteAvatar = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<User>(`/api/users/${id}/avatar`),
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
    queryFn: () => api.post<User>('/api/password/lookup', { token }),
    enabled: !!token,
    retry: false,
  });

export const useMatches = (
  opts: { userId?: number; mode?: Mode; limit?: number; offset?: number } = {},
) => {
  const { userId, mode, limit = 50, offset = 0 } = opts;
  return useQuery({
    queryKey: ['matches', { userId, mode, limit, offset }],
    queryFn: () => {
      const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (userId) qs.set('user_id', String(userId));
      if (mode) qs.set('mode', mode);
      return api.get<MatchList>(`/api/matches?${qs.toString()}`);
    },
    placeholderData: (prev) => prev,
  });
};

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
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
};

export const useBalance = () =>
  useMutation({
    mutationFn: (vars: { player_ids: number[] }) =>
      api.post<BalanceResult>('/api/balance', vars),
  });

export const useTwoVsOneBalance = () =>
  useMutation({
    mutationFn: (vars: { player_ids: number[] }) =>
      api.post<TwoVsOneBalanceResult>('/api/balance/2v1', vars),
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
    refetchOnWindowFocus: true,
  });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { default_goals_to_win: number; twovone_penalty?: number }) =>
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

export const useCanManage = () => {
  const me = useMe();
  const role = me.data?.role;
  return role === 'admin' || role === 'moderator';
};

export const useCurrentOrganization = () => {
  const me = useMe();
  return useQuery({
    queryKey: ['current-organization'],
    queryFn: () => api.get<Organization>('/api/organizations/current'),
    enabled: me.data !== null && me.data !== undefined,
  });
};

export const useOrganizations = (enabled = true) =>
  useQuery({
    queryKey: ['organizations'],
    queryFn: () => api.get<Organization[]>('/api/organizations'),
    enabled,
  });

export const useCreateOrganization = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string }) =>
      api.post<Organization>('/api/organizations', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
};

export const useUpdateOrganization = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; name: string }) =>
      api.patch<Organization>(`/api/organizations/${vars.id}`, { name: vars.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['current-organization'] });
    },
  });
};

export const useDeleteOrganization = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/organizations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  });
};
