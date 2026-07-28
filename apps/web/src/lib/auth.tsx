import type { PermissionKey, RoleKey } from '@jumpstart/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api } from './api';

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: RoleKey[];
  permissions: string[];
  chapter: string | null;
}

interface AuthContextValue {
  user: Me | null;
  isLoading: boolean;
  /** SPA-side permission check — UX only; the API re-checks everything (§7.1). */
  can: (permission: PermissionKey) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<Me>('/auth/me').catch(() => null),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const user = data ?? null;
  const permissionSet = new Set(user?.permissions ?? []);

  const value: AuthContextValue = {
    user,
    isLoading,
    can: (permission) => permissionSet.has(permission),
    logout: async () => {
      await api.post('/auth/logout').catch(() => undefined);
      queryClient.clear();
      window.location.assign('/login');
    },
    refresh: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
