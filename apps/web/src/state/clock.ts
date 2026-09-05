import { create } from 'zustand';

export const CLOCK_START = '2025-12-31';
export const CLOCK_END = '2026-08-26';

const DAY_MS = 86_400_000;
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const clamp = (iso: string): string =>
  iso < CLOCK_START ? CLOCK_START : iso > CLOCK_END ? CLOCK_END : iso;

interface ClockState {
  /** Dataset date the workbench is replaying. */
  clock: string;
  playing: boolean;
  /** Dataset days advanced per real second while playing. */
  speed: number;
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
 * analysis uses all follow this date so the RM can scrub through 2026.
 */
export const useClock = create<ClockState>((set, get) => ({
  clock: CLOCK_END,
  playing: false,
  speed: 3,
  set: (iso) => {
    set({ clock: clamp(iso) });
  },
  play: () => {
    if (get().clock >= CLOCK_END) {
      set({ clock: CLOCK_START });
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
    const ms = Date.parse(`${get().clock}T00:00:00Z`) + days * DAY_MS;
    set({ clock: clamp(toIso(ms)) });
  },
  jumpToToday: () => {
    set({ clock: CLOCK_END, playing: false });
  },
}));

let timer: ReturnType<typeof setInterval> | null = null;
useClock.subscribe((s) => {
  if (s.playing && timer === null) {
    timer = setInterval(() => {
      const st = useClock.getState();
      if (!st.playing) {
        return;
      }
      if (st.clock >= CLOCK_END) {
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
