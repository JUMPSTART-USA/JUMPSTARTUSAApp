import type { ChapterState, PermissionKey, RoleKey } from '@jumpstart/shared';
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
  /** Real account roles — differs from `roles` only during a "view as role" preview. */
  actualRoles: RoleKey[];
  /** Set while an administrator is previewing the app as another role. */
  viewAsRole: RoleKey | null;
  /** Whether the account has confirmed a TOTP authenticator (drives /account). */
  totpEnabled: boolean;
  /** Registered passkeys — satisfies the second-factor mandate like TOTP. */
  passkeyCount: number;
  /** True when a TOTP-mandatory role has not enrolled yet (soft nudge banner). */
  mustSetupTotp: boolean;
  chapter: string | null;
  /** Real default chapter (first scope row), ignoring any preview. */
  actualChapter: string | null;
  /** Chapters the account may view: specific states, or null = all chapters. */
  allowedChapters: string[] | null;
  /** Set while previewing a single chapter. */
  viewChapter: string | null;
}

/** A "view as" change: only the fields present are applied; null exits that preview. */
export interface ViewAsChange {
  role?: RoleKey | null;
  chapter?: ChapterState | null;
}

interface AuthContextValue {
  user: Me | null;
  isLoading: boolean;
  /** SPA-side permission check — UX only; the API re-checks everything (§7.1). */
  can: (permission: PermissionKey) => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
  /** Preview the app as another role (admins) and/or chapter (multi-chapter accounts). */
  viewAs: (change: ViewAsChange) => Promise<void>;
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
    viewAs: async (change) => {
      await api.post('/auth/view-as', change);
      /**
       * Everything cached was fetched under the previous role's access, so a
       * full reload restarts the SPA cleanly under the new one (same as
       * logout). RELOAD, though — not assign('/').
       *
       * Sending everyone to the dashboard threw away the page they were on,
       * which is the one thing a chapter switch is usually FOR: comparing the
       * same list across chapters. Reloading in place keeps the route, the
       * filters and the scroll position's URL state.
       *
       * A detail page for a record outside the new chapter will 404 after
       * this, and that is the honest answer — it tells the user the record is
       * not in the chapter they just switched to, where a silent bounce to the
       * dashboard left them guessing what happened.
       */
      queryClient.clear();
      window.location.reload();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/**
 * The session if one exists, null if no provider is mounted — for components
 * that RENDER in sessionless trees rather than requiring one (the tokenized
 * portal, unit tests). Prefer useAuth everywhere a session is a precondition:
 * this variant's null looks the same as "not signed in", and a component that
 * silently does less because a provider was forgotten is harder to notice than
 * a thrown error.
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
