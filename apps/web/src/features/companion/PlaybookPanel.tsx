import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlaybooksResponse, ShadowRunResponse, type ShadowDraft } from '@jb/contracts';
import { useState, type JSX } from 'react';
import { Pill } from '@/components/Pill';
import { getJson, postJson } from '@/lib/api';
import { useClockDate } from '@/state/clock';
import { z } from 'zod';

/**
 * A playbook inside the call: the steps as a checklist with what to cover, and beside each step what
 * an agent would have said from the client's facts. The RM grades the draft with one tap; agreement
 * per playbook is what earns the next rung of autonomy. Nothing here reaches the client.
 */
export function PlaybookPanel({
  clientId,
  onStep,
}: {
  clientId: string;
  onStep: (text: string) => void;
}): JSX.Element {
  const clock = useClockDate();
  const qc = useQueryClient();
  const playbooks = useQuery({
    queryKey: ['playbooks'],
    queryFn: () => getJson('/api/v1/playbooks', PlaybooksResponse),
    staleTime: 600_000,
  });
  const [selected, setSelected] = useState<string>('');
  const shadow = useQuery({
    queryKey: ['shadow', clientId, selected, clock],
    queryFn: () =>
      getJson(`/api/v1/clients/${clientId}/shadow/${selected}?clock=${clock}`, ShadowRunResponse),
    enabled: selected !== '' && clock !== '',
  });
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [graded, setGraded] = useState<Record<string, 'agree' | 'disagree' | 'edited'>>({});
  const grade = useMutation({
    mutationFn: (v: {
      draft: ShadowDraft;
      grade: 'agree' | 'disagree' | 'edited';
      rmText?: string;
    }) =>
      postJson(
        `/api/v1/clients/${clientId}/shadow/grade`,
        {
          playbookId: v.draft.playbookId,
          stepId: v.draft.stepId,
          draft: v.draft.text,
          source: v.draft.source,
          grade: v.grade,
          ...(v.rmText ? { rmText: v.rmText } : {}),
        },
        z.unknown(),
      ).catch((e: unknown) => {
        // 204 has no body; treat parse of empty as success.
        if (e instanceof SyntaxError) {
          return null;
        }
        throw e;
      }),
    onSuccess: (_r, v) => {
      setGraded((g) => ({ ...g, [v.draft.stepId]: v.grade }));
      void qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
  const pb = shadow.data?.playbook;

  return (
    <section className="rounded border border-line bg-surface-2 px-3 py-2 text-[12px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-2">
          Playbook
        </span>
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setDone({});
            setGraded({});
          }}
          className="rounded border border-line bg-surface px-1.5 py-0.5 text-[12px]"
        >
          <option value="">None · free conversation</option>
          {(playbooks.data?.playbooks ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {playbooks.data?.source === 'none' && (
        <div className="text-warn">No playbook reference file loaded.</div>
      )}
      {pb && shadow.data && (
        <>
          <div className="text-ink-2">{pb.goal}</div>
          {pb.requiredDisclosures.length > 0 && (
            <div className="mt-0.5 text-[11.5px] text-brass">
              Say: {pb.requiredDisclosures.join(' ')}
            </div>
          )}
          {shadow.data.escalations.length > 0 && (
            <div className="mt-1 rounded border border-crit/40 bg-crit-soft px-2 py-1 text-[11.5px] text-crit">
              Escalation words found in this client's notes: {shadow.data.escalations.join(', ')}.
              An agent would hand this call to you.
            </div>
          )}
          <ol className="m-0 mt-2 list-none space-y-2 p-0">
            {pb.steps.map((s, i) => {
              const d = shadow.data.drafts.find((x) => x.stepId === s.id);
              const g = graded[s.id];
              return (
                <li key={s.id} className="rounded border border-line bg-surface px-2.5 py-1.5">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={done[s.id] ?? false}
                      onChange={(e) => {
                        setDone((x) => ({ ...x, [s.id]: e.target.checked }));
                        if (e.target.checked && d) {
                          onStep(`[${pb.name} · ${s.prompt}] ${d.text}`);
                        }
                      }}
                    />
                    <span>
                      <span className="font-medium text-ink">
                        {i + 1}. {s.prompt}
                      </span>
                    </span>
                  </label>
                  {d && (
                    <div className="mt-1 border-l-2 border-line pl-2">
                      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                        An agent would say{' '}
                        <span className="normal-case tracking-normal">({d.source})</span>
                      </div>
                      <div className={`text-ink-2 ${d.missing.length ? 'italic' : ''}`}>
                        {d.text}
                      </div>
                      {d.missing.length > 0 && (
                        <div className="text-[11px] text-warn">
                          Facts missing: {d.missing.join(', ')}. Not gradable as written.
                        </div>
                      )}
                      {d.missing.length === 0 && (
                        <div className="mt-1 flex items-center gap-1.5">
                          {g ? (
                            <Pill tone={g === 'agree' ? 'ok' : g === 'disagree' ? 'crit' : 'warn'}>
                              graded: {g}
                            </Pill>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  grade.mutate({ draft: d, grade: 'agree' });
                                }}
                                className="rounded border border-ok/50 bg-ok-soft px-2 py-0.5 text-[11px] text-ok"
                              >
                                I would say this
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  grade.mutate({ draft: d, grade: 'disagree' });
                                }}
                                className="rounded border border-crit/40 bg-crit-soft px-2 py-0.5 text-[11px] text-crit"
                              >
                                Not like this
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-1 text-[11px] text-muted">Done when: {pb.doneCondition}</div>
        </>
      )}
      {shadow.isError && <div className="text-crit">{shadow.error.message}</div>}
    </section>
  );
}
