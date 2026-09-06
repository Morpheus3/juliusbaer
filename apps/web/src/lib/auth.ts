import { create } from 'zustand';

export interface SessionUser {
  subject: string;
  displayName: string;
  roles: string[];
  rmId: string | null;
  teamId: string | null;
  scope: 'own' | 'team' | 'all';
  level: number;
}

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  setSession: (token: string, user: SessionUser) => void;
  clear: () => void;
}

const KEY = 'rmw.session';

function read(): { token: string; user: SessionUser } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as { token: string; user: SessionUser }) : null;
  } catch {
    return null;
  }
}

/** The signed-in identity. The token is a bearer JWT; the API resolves scope from it on every request. */
export const useAuth = create<AuthState>((set) => {
  const stored = read();
  return {
    token: stored?.token ?? null,
    user: stored?.user ?? null,
    setSession: (token, user) => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ token, user }));
      } catch {
        /* memory only */
      }
      set({ token, user });
    },
    clear: () => {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      set({ token: null, user: null });
    },
  };
});

/** fetch with the bearer token; a 401 clears the session so the login screen returns. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuth.getState().token;
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401 && token) {
    useAuth.getState().clear();
  }
  return res;
}
