import { create } from "zustand";
import type { EmergencyCase, AgentLogEntry, CaseStatus } from "./types";

interface State {
  cases: Record<string, EmergencyCase>;
  activeCaseId: string | null;
  setCase: (c: EmergencyCase) => void;
  updateCase: (id: string, patch: Partial<EmergencyCase>) => void;
  pushLog: (id: string, entry: AgentLogEntry) => void;
  setStatus: (id: string, status: CaseStatus) => void;
  setActive: (id: string | null) => void;
  hydrate: (cases: Record<string, EmergencyCase>) => void;
}

const STORAGE_KEY = "medirelay.cases.v1";
const CHANNEL = typeof window !== "undefined" && "BroadcastChannel" in window
  ? new BroadcastChannel("medirelay")
  : null;

function persist(cases: Record<string, EmergencyCase>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
  } catch {}
}

function broadcast(cases: Record<string, EmergencyCase>) {
  CHANNEL?.postMessage({ type: "STATE", cases });
}

export const useStore = create<State>((set, get) => ({
  cases: {},
  activeCaseId: null,
  setCase: (c) => {
    const cases = { ...get().cases, [c.id]: c };
    persist(cases);
    broadcast(cases);
    set({ cases, activeCaseId: c.id });
  },
  updateCase: (id, patch) => {
    const existing = get().cases[id];
    if (!existing) return;
    const cases = { ...get().cases, [id]: { ...existing, ...patch } };
    persist(cases);
    broadcast(cases);
    set({ cases });
  },
  pushLog: (id, entry) => {
    const existing = get().cases[id];
    if (!existing) return;
    const updated = { ...existing, agentLog: [...existing.agentLog, entry] };
    const cases = { ...get().cases, [id]: updated };
    persist(cases);
    broadcast(cases);
    set({ cases });
  },
  setStatus: (id, status) => {
    const existing = get().cases[id];
    if (!existing) return;
    const cases = { ...get().cases, [id]: { ...existing, status } };
    persist(cases);
    broadcast(cases);
    set({ cases });
  },
  setActive: (id) => set({ activeCaseId: id }),
  hydrate: (cases) => set({ cases }),
}));

// Cross-tab + initial hydration
export function initStoreSync() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) useStore.getState().hydrate(JSON.parse(raw));
  } catch {}
  CHANNEL?.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.type === "STATE") {
      useStore.getState().hydrate(e.data.cases);
    }
  });
}
