import { create } from 'zustand';
import type { AssistantResponse } from '@jb/contracts';

export interface Turn {
  id: string;
  text: string;
  at: string;
  response: AssistantResponse | null;
  error: string | null;
  pending: boolean;
}

interface AssistantState {
  open: boolean;
  turns: Turn[];
  setOpen: (v: boolean) => void;
  toggle: () => void;
  push: (t: Turn) => void;
  update: (id: string, patch: Partial<Turn>) => void;
  clear: () => void;
}

/** The drawer's conversation for this session. Not persisted: the audit trail holds what mattered. */
export const useAssistant = create<AssistantState>((set) => ({
  open: false,
  turns: [],
  setOpen: (open) => {
    set({ open });
  },
  toggle: () => {
    set((s) => ({ open: !s.open }));
  },
  push: (t) => {
    set((s) => ({ turns: [...s.turns, t] }));
  },
  update: (id, patch) => {
    set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  },
  clear: () => {
    set({ turns: [] });
  },
}));
