import { useEffect, type JSX } from 'react';
import { fmtDate } from '@/lib/format';
import { useMeta } from '@/lib/meta';
import { useClock } from '@/state/clock';

const DAY_MS = 86_400_000;

/** Replay control: scrub through the dataset's history, play it back, or jump to today. */
export function ClockControl(): JSX.Element | null {
  const meta = useMeta();
  const { clock, start, end, playing, speed, toggle, set, setSpeed, jumpToToday, configure } =
    useClock();
  useEffect(() => {
    if (meta.data) {
      configure(meta.data.clockStart, meta.data.clockEnd);
    }
  }, [meta.data, configure]);
  if (!clock || !start || !end) {
    return null;
  }
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const totalDays = (Date.parse(`${end}T00:00:00Z`) - startMs) / DAY_MS;
  const pos = (Date.parse(`${clock}T00:00:00Z`) - startMs) / DAY_MS;
  const isToday = clock === end;
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px]">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause replay' : 'Play replay'}
        className="grid h-6 w-6 place-items-center rounded bg-ink text-[10px] text-white hover:bg-accent"
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range"
        min={0}
        max={Math.max(totalDays, 1)}
        value={pos}
        aria-label="Dataset date"
        onChange={(e) => {
          set(new Date(startMs + Number(e.target.value) * DAY_MS).toISOString().slice(0, 10));
        }}
        className="w-32 accent-[#1f4e79]"
      />
      <span
        className={`tnum w-[92px] font-mono text-[12px] ${isToday ? 'text-ink' : 'text-brass'}`}
      >
        {fmtDate(clock)}
      </span>
      <select
        aria-label="Replay speed"
        value={speed}
        onChange={(e) => {
          setSpeed(Number(e.target.value));
        }}
        className="rounded border border-line bg-surface px-1 py-0.5 text-[11px]"
      >
        <option value={1}>1d/s</option>
        <option value={3}>3d/s</option>
        <option value={7}>7d/s</option>
        <option value={14}>14d/s</option>
      </select>
      {!isToday && (
        <button
          type="button"
          onClick={jumpToToday}
          className="text-[11.5px] text-accent hover:underline"
        >
          Today
        </button>
      )}
    </div>
  );
}
