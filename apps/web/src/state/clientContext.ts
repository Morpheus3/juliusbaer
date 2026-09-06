import { create } from 'zustand';

const CLIENT_ROUTE = /^\/clients\/([^/]+)(\/.*)?$/;
const STORAGE_KEY = 'rmw.lastClientId';

/** The client a route is about, or null for book-level screens. */
export function clientIdFromPath(pathname: string): string | null {
  const m = CLIENT_ROUTE.exec(pathname);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/**
 * The same room for another client: `/clients/A/portfolio/exposure?x=1` becomes
 * `/clients/B/portfolio/exposure?x=1`. Off the client routes it opens the client's journey.
 */
export function switchClientPath(pathname: string, search: string, clientId: string): string {
  const m = CLIENT_ROUTE.exec(pathname);
  const rest = m?.[2] ?? '';
  const base = `/clients/${encodeURIComponent(clientId)}${m ? rest : ''}`;
  return m ? `${base}${search}` : base;
}

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

interface ClientContextState {
  /** The last client the RM was looking at; survives leaving the client screens and a reload. */
  lastClientId: string | null;
  setLastClientId: (id: string) => void;
}

/**
 * Client context. The URL is the source of truth for which client a screen is about; this store
 * only remembers the last one so the rail, the switcher and later the drawer can stay on her.
 */
export const useClientContext = create<ClientContextState>((set) => ({
  lastClientId: readStored(),
  setLastClientId: (id) => {
    try {
      sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage unavailable: memory only */
    }
    set({ lastClientId: id });
  },
}));
