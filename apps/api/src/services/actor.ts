/**
 * Who is calling, resolved once per request from the verified token and access.users. Carried in
 * AsyncLocalStorage so services read it without threading a parameter through every call.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { drizzleFor } from '@jb/db';

export type Scope = 'own' | 'team' | 'all';

export interface Actor {
  userId: string;
  subject: string;
  displayName: string;
  roles: string[];
  rmId: string | null;
  teamId: string | null;
  scope: Scope;
  /** 2 when the caller may act as checker or head; 1 otherwise. */
  level: number;
}

export interface RequestStore {
  actor: Actor;
  /** Drizzle bound to the connection whose app.scope was set for this request. */
  db: ReturnType<typeof drizzleFor>;
}

export const requestStore = new AsyncLocalStorage<RequestStore>();

/** The current actor, or null outside a request (loaders, tests). */
export function currentActor(): Actor | null {
  return requestStore.getStore()?.actor ?? null;
}

export function scopeFor(roles: string[]): Scope {
  if (roles.includes('admin')) {
    return 'all';
  }
  if (roles.includes('team_head')) {
    return 'team';
  }
  return 'own';
}

export function levelFor(roles: string[]): number {
  return roles.some((r) => r === 'checker' || r === 'team_head' || r === 'admin') ? 2 : 1;
}
