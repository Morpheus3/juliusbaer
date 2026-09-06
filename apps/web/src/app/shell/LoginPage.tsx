import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { z } from 'zod';
import { Pill } from '@/components/Pill';
import { getJson, postJson } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const Mode = z.object({ mode: z.enum(['dev', 'oidc']) });
const DevUsers = z.object({
  users: z.array(
    z.object({
      subject: z.string(),
      displayName: z.string(),
      roles: z.array(z.string()),
      rmId: z.string().nullable(),
      teamId: z.string().nullable(),
      scope: z.enum(['own', 'team', 'all']),
    }),
  ),
});
const LoginResponse = z.object({
  token: z.string(),
  expiresIn: z.number(),
  user: z.object({
    subject: z.string(),
    displayName: z.string(),
    roles: z.array(z.string()),
    rmId: z.string().nullable(),
    teamId: z.string().nullable(),
    scope: z.enum(['own', 'team', 'all']),
    level: z.number(),
  }),
});

const SCOPE_LABEL = { own: 'own book', team: 'the team', all: 'everything' } as const;

/**
 * Sign-in. In development the API lists the identities the dataset defines (one per RM, plus the
 * head, checker and admin from the reference file) and issues a token for the one chosen; in
 * production the bank's identity provider does, and this page only redirects.
 */
export function LoginPage(): JSX.Element {
  const setSession = useAuth((s) => s.setSession);
  const mode = useQuery({
    queryKey: ['auth-mode'],
    queryFn: () => getJson('/api/v1/auth/mode', Mode),
    staleTime: 600_000,
  });
  const users = useQuery({
    queryKey: ['auth-dev-users'],
    queryFn: () => getJson('/api/v1/auth/dev/users', DevUsers),
    enabled: mode.data?.mode === 'dev',
  });
  const [busy, setBusy] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: (subject: string) => postJson('/api/v1/auth/dev/login', { subject }, LoginResponse),
    onSuccess: (r) => {
      setSession(r.token, r.user);
    },
    onSettled: () => {
      setBusy(null);
    },
  });

  return (
    <div className="grid min-h-screen place-items-center bg-ground px-6">
      <div className="w-[560px] max-w-full rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-brass font-serif text-[15px] font-semibold text-white">
            PB
          </div>
          <div>
            <div className="font-serif text-[22px] font-semibold leading-tight text-ink">
              RM Workbench
            </div>
            <div className="text-[12px] text-muted">Private Banking · sign in to your book</div>
          </div>
        </div>
        {mode.isPending && <p className="text-muted">Checking the sign-in mode…</p>}
        {mode.isError && (
          <div className="rounded border border-crit/30 bg-crit-soft px-4 py-3 text-crit">
            The API is not reachable: {mode.error.message}
          </div>
        )}
        {mode.data?.mode === 'oidc' && (
          <p className="text-[13.5px] text-ink-2">
            Sign-in is handled by the bank's identity provider. Open the workbench from the bank
            portal so it can issue your session.
          </p>
        )}
        {mode.data?.mode === 'dev' && (
          <>
            <p className="mb-3 text-[13px] text-ink-2">
              Development identities. Each sees only what row-level security lets them see: an RM
              their own book, a team head the team, an admin everything.
            </p>
            <ul className="m-0 list-none divide-y divide-line p-0">
              {(users.data?.users ?? []).map((u) => (
                <li key={u.subject} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <div className="font-medium text-ink">{u.displayName}</div>
                    <div className="text-[11.5px] text-muted">
                      {u.subject}
                      {u.rmId ? ` · ${u.rmId}` : ''} · sees {SCOPE_LABEL[u.scope]}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.roles.map((r) => (
                      <Pill
                        key={r}
                        tone={
                          r === 'admin'
                            ? 'crit'
                            : r === 'team_head'
                              ? 'brass'
                              : r === 'checker'
                                ? 'info'
                                : 'neutral'
                        }
                      >
                        {r.replace('_', ' ')}
                      </Pill>
                    ))}
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        setBusy(u.subject);
                        login.mutate(u.subject);
                      }}
                      className="rounded bg-accent px-3 py-1 text-[12.5px] font-medium text-white disabled:bg-surface-2 disabled:text-muted"
                    >
                      {busy === u.subject ? 'Signing in…' : 'Sign in'}
                    </button>
                  </div>
                </li>
              ))}
              {users.data?.users.length === 0 && (
                <li className="py-2 text-muted">No identities: run the seed.</li>
              )}
            </ul>
            {login.isError && (
              <div className="mt-3 text-[12.5px] text-crit">{login.error.message}</div>
            )}
            <p className="mt-4 text-[11px] text-muted">
              Development mode issues tokens without a password. Production uses the bank's OIDC
              provider; set AUTH_MODE=oidc on the API.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
