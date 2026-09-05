import { create } from 'zustand';

const DAY_MS = 86_400_000;
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

interface ClockState {
  /** Dataset date the workbench is replaying; null until the dataset range is known. */
  clock: string | null;
  start: string | null;
  end: string | null;
  playing: boolean;
  /** Dataset days advanced per real second while playing. */
  speed: number;
  configure: (start: string, end: string) => void;
  set: (iso: string) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (n: number) => void;
  step: (days: number) => void;
  jumpToToday: () => void;
}

/**
 * Replay clock. The dataset is static; the feed, freshness scores and the snapshot the
 * analysis uses all follow this date. The range comes from the dataset meta, never from code.
 */
export const useClock = create<ClockState>((set, get) => {
  const clamp = (iso: string): string => {
    const { start, end } = get();
    if (start && iso < start) {
      return start;
    }
    if (end && iso > end) {
      return end;
    }
    return iso;
  };
  return {
    clock: null,
    start: null,
    end: null,
    playing: false,
    speed: 3,
    configure: (start, end) => {
      const cur = get();
      if (cur.start === start && cur.end === end) {
        return;
      }
      set({ start, end, clock: cur.clock === null ? end : clamp(cur.clock) });
    },
    set: (iso) => {
      set({ clock: clamp(iso) });
    },
    play: () => {
      const { clock, end, start } = get();
      if (clock !== null && end !== null && clock >= end && start !== null) {
        set({ clock: start });
      }
      set({ playing: true });
    },
    pause: () => {
      set({ playing: false });
    },
    toggle: () => {
      if (get().playing) {
        get().pause();
      } else {
        get().play();
      }
    },
    setSpeed: (n) => {
      set({ speed: n });
    },
    step: (days) => {
      const { clock } = get();
      if (clock === null) {
        return;
      }
      set({ clock: clamp(toIso(Date.parse(`${clock}T00:00:00Z`) + days * DAY_MS)) });
    },
    jumpToToday: () => {
      set({ clock: get().end, playing: false });
    },
  };
});

let timer: ReturnType<typeof setInterval> | null = null;
useClock.subscribe((s) => {
  if (s.playing && timer === null) {
    timer = setInterval(() => {
      const st = useClock.getState();
      if (!st.playing) {
        return;
      }
      if (st.clock !== null && st.end !== null && st.clock >= st.end) {
        st.pause();
        return;
      }
      st.step(st.speed);
    }, 1000);
  } else if (!s.playing && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
});

/** The clock as a query parameter value; falls back to the dataset's end while the range loads. */
export function useClockDate(): string {
  const { clock, end } = useClock();
  return clock ?? end ?? '';
}
