// lib/pageEvents.ts
import type { Snapshot } from "./types";
type Listener = (snap: Snapshot) => void;

const topics = new Map<string, Set<Listener>>();

export function publish(id: string, snap: Snapshot) {
  const set = topics.get(id);
  if (!set) return;
  for (const fn of Array.from(set)) { try { fn(snap); } catch {} }
}

export function subscribe(id: string, fn: Listener): () => void {
  let set = topics.get(id);
  if (!set) { set = new Set(); topics.set(id, set); }
  set.add(fn);
  return () => {
    const s = topics.get(id);
    if (!s) return;
    s.delete(fn);
    if (s.size === 0) topics.delete(id);
  };
}
