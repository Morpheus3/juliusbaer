import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClaudeSettings } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { ApiError, getJson } from '@/lib/api';

async function send<T>(
  url: string,
  method: 'POST' | 'DELETE',
  body: unknown,
  parse: (v: unknown) => T,
): Promise<T> {
  const init: RequestInit = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      typeof json === 'object' &&
      json !== null &&
      'message' in json &&
      typeof json.message === 'string'
        ? json.message
        : res.statusText;
    throw new ApiError(res.status, message);
  }
  return parse(json);
}

/**
 * Claude connection panel in the rail. The key goes to the API, which validates it against the
 * Anthropic models endpoint and keeps it in process memory; it is never stored in the browser.
 */
export function ClaudeKeyPanel(): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['settings', 'claude'],
    queryFn: () => getJson('/api/v1/settings/claude', ClaudeSettings),
    refetchInterval: 60_000,
  });
  const [key, setKey] = useState('');
  const [persist, setPersist] = useState(false);
  const [open, setOpen] = useState(false);
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['settings', 'claude'] });
    void qc.invalidateQueries({ queryKey: ['rubric'] });
    void qc.invalidateQueries({ queryKey: ['workflow'] });
  };
  const save = useMutation({
    mutationFn: () =>
      send('/api/v1/settings/claude', 'POST', { apiKey: key.trim(), persist }, (v) =>
        ClaudeSettings.parse(v),
      ),
    onSuccess: () => {
      setKey('');
      setOpen(false);
      invalidate();
    },
  });
  const clear = useMutation({
    mutationFn: () =>
      send('/api/v1/settings/claude', 'DELETE', undefined, (v) => ClaudeSettings.parse(v)),
    onSuccess: invalidate,
  });
  const s = q.data;
  const live = s?.mode === 'live';
  return (
    <div className="border-t border-rail-2 px-5 py-3 text-[11.5px]">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-rail-muted">
          Claude
        </span>
        <span
          className={`inline-flex items-center gap-1 ${live ? 'text-emerald-300' : 'text-amber-300'}`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-amber-400'}`}
          />
          {s ? (live ? 'live' : 'recorded') : '…'}
        </span>
      </div>
      {s && (
        <div className="mt-1 text-rail-muted">
          {live ? (
            <>
              key {s.keyHint} · {s.source === 'environment' ? 'from .env' : 'entered here'}
              {s.persisted ? ' · saved' : ''}
              <br />
              {s.analysisModel}
            </>
          ) : (
            <>No API key. Assessors and outreach run without the language model.</>
          )}
        </div>
      )}
      {!open ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
            className="rounded border border-rail-muted/50 px-2 py-0.5 text-rail-ink hover:bg-rail-2"
          >
            {live ? 'Replace key' : 'Enter API key'}
          </button>
          {s && live && s.source === 'runtime' && (
            <button
              type="button"
              onClick={() => {
                clear.mutate();
              }}
              className="rounded border border-rail-muted/30 px-2 py-0.5 text-rail-muted hover:bg-rail-2"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        <form
          className="mt-2 space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
            }}
            placeholder="sk-ant-…"
            aria-label="Anthropic API key"
            className="w-full rounded border border-rail-muted/40 bg-rail-2 px-2 py-1 font-mono text-[11px] text-white placeholder:text-rail-muted"
          />
          <label className="flex items-center gap-1.5 text-rail-muted">
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => {
                setPersist(e.target.checked);
              }}
              className="accent-[#8f6f3a]"
            />
            also save to the local .env
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={key.trim().length < 20 || save.isPending}
              className="rounded bg-brass px-2 py-0.5 font-medium text-white disabled:opacity-40"
            >
              {save.isPending ? 'Validating…' : 'Validate and use'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setKey('');
              }}
              className="rounded border border-rail-muted/30 px-2 py-0.5 text-rail-muted"
            >
              Cancel
            </button>
          </div>
          {save.isError && <div className="text-[11px] text-rose-300">{save.error.message}</div>}
          <div className="text-[10.5px] text-rail-muted">
            Validated against the Anthropic models endpoint; held in the API process, not in the
            browser.
          </div>
        </form>
      )}
    </div>
  );
}
