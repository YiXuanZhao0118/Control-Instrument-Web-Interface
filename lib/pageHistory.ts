// lib/pageHistory.ts
import fs from "node:fs/promises";
import path from "node:path";
import { getPageState, setPageState } from "./dataStore";
import { publish } from "./pageEvents";
import type { Json, Snapshot } from "./types";

const HIST_FILE = path.join(process.cwd(), "app", "data", "page_history.json");
const MAX_HISTORY = 50; // 最多 50 步

type HistoryRecord = { rev: number; cursor: number; stack: Json[]; lastTs?: number; };
type HistMap = Record<string, HistoryRecord>;

let mem: HistMap | null = null;
let lock: Promise<void> = Promise.resolve();

async function ensureDir(file = HIST_FILE) { await fs.mkdir(path.dirname(file), { recursive: true }); }
async function atomicWrite(file: string, data: string) {
  await ensureDir(file);
  const tmp = `${file}.${Date.now().toString(36)}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, data, "utf-8");
  try { await fs.rename(tmp, file); } catch { await fs.writeFile(file, data, "utf-8"); await fs.rm(tmp, { force: true }); }
}
async function loadAll(): Promise<HistMap> {
  if (mem) return mem;
  try {
    const raw = await fs.readFile(HIST_FILE, "utf-8");
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j)) mem = {};
    else {
      const src = j as Record<string, unknown>;
      const out: HistMap = {};
      for (const [k, v] of Object.entries(src)) {
        const t = v as Partial<HistoryRecord>;
        out[k] = {
          rev: typeof t.rev === "number" ? t.rev : 0,
          cursor: typeof t.cursor === "number" ? t.cursor : 0,
          stack: Array.isArray(t.stack) ? t.stack : [null],
          lastTs: typeof t.lastTs === "number" ? t.lastTs : undefined
        };
        if (out[k].cursor < 0) out[k].cursor = 0;
        if (out[k].cursor > out[k].stack.length - 1) out[k].cursor = out[k].stack.length - 1;
      }
      mem = out;
    }
  } catch { mem = {}; }
  return mem!;
}
async function saveAll(map: HistMap) { mem = map; await atomicWrite(HIST_FILE, JSON.stringify(map, null, 2)); }
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock; let release!: () => void;
  lock = new Promise(r => (release = r)); await prev.catch(() => undefined);
  try { const out = await fn(); release(); return out; } catch (e) { release(); throw e; }
}

async function ensureInit(id: string): Promise<HistoryRecord> {
  const all = await loadAll();
  if (!all[id]) {
    const cur = (await getPageState(id)) ?? null;
    all[id] = { rev: 0, cursor: 0, stack: [cur], lastTs: Date.now() };
    await saveAll(all);
  }
  return all[id];
}

export async function getPageSnapshot(id: string): Promise<Snapshot> {
  const st = await ensureInit(id);
  const state = st.stack[st.cursor] ?? null;
  return { rev: st.rev, state };
}

export async function mutatePage(id: string, baseRev: number, nextState: Json, user?: string): Promise<Snapshot> {
  return withLock(async () => {
    const all = await loadAll(); const st = await ensureInit(id);
    if (baseRev !== st.rev) throw { code: "REV_MISMATCH", rev: st.rev } as { code: string; rev:number };

    const cur = st.stack[st.cursor] ?? null;
    if (JSON.stringify(cur) === JSON.stringify(nextState)) return { rev: st.rev, state: cur };

    // 切掉 redo 分支
    if (st.cursor < st.stack.length - 1) st.stack = st.stack.slice(0, st.cursor + 1);

    // 推入新狀態
    st.stack.push(nextState);
    st.cursor = st.stack.length - 1;
    st.rev += 1; st.lastTs = Date.now();

    // 保留最多 50 步（stack 會含起點，因此上限 = MAX_HISTORY + 1）
    const maxLen = MAX_HISTORY + 1;
    if (st.stack.length > maxLen) {
      const prune = st.stack.length - maxLen;
      st.stack.splice(0, prune);
      st.cursor -= prune;
      if (st.cursor < 0) st.cursor = 0;
    }

    await setPageState(id, nextState);
    await saveAll(all);

    const snap: Snapshot = { rev: st.rev, state: nextState };
    publish(id, snap); return snap;
  });
}

export async function undoPage(id: string): Promise<Snapshot> {
  return withLock(async () => {
    const all = await loadAll(); const st = await ensureInit(id);
    if (st.cursor === 0) { const state = st.stack[st.cursor] ?? null; return { rev: st.rev, state }; }
    st.cursor -= 1; st.rev = Math.max(0, st.rev - 1); st.lastTs = Date.now();
    const state = st.stack[st.cursor] ?? null;
    await setPageState(id, state); await saveAll(all);
    const snap: Snapshot = { rev: st.rev, state }; publish(id, snap); return snap;
  });
}

export async function redoPage(id: string): Promise<Snapshot> {
  return withLock(async () => {
    const all = await loadAll(); const st = await ensureInit(id);
    if (st.cursor >= st.stack.length - 1) { const state = st.stack[st.cursor] ?? null; return { rev: st.rev, state }; }
    st.cursor += 1; st.rev += 1; st.lastTs = Date.now();
    const state = st.stack[st.cursor] ?? null;
    await setPageState(id, state); await saveAll(all);
    const snap: Snapshot = { rev: st.rev, state }; publish(id, snap); return snap;
  });
}

export async function getHistoryInfo(id: string) {
  const st = await ensureInit(id);
  return { rev: st.rev, canUndo: st.cursor > 0, canRedo: st.cursor < st.stack.length - 1, length: st.stack.length, cursor: st.cursor };
}
