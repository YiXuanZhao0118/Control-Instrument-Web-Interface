// lib/dataStore.ts
import fs from "node:fs/promises";
import path from "node:path";
import { Dict, Json, PageMeta } from "./types";

const FILE = path.join(process.cwd(), "app", "data", "data.json");
const FILE_ALT = path.join(process.cwd(), "app", "data", "Data.json");

type StoredPage = { id: string; title: string; state: Json };
type DataArray = StoredPage[];

let mem: DataArray | null = null;
let lock: Promise<void> = Promise.resolve();

async function ensureDir(fp = FILE) { await fs.mkdir(path.dirname(fp), { recursive: true }); }
async function atomicWrite(fp: string, data: string) {
  await ensureDir(fp);
  const tmp = `${fp}.${Date.now().toString(36)}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, data, "utf-8");
  try { await fs.rename(tmp, fp); } catch { await fs.writeFile(fp, data, "utf-8"); await fs.rm(tmp, { force:true }); }
}
async function readPref(): Promise<string> {
  try { return await fs.readFile(FILE, "utf-8"); }
  catch { return await fs.readFile(FILE_ALT, "utf-8"); }
}
async function readAll(): Promise<DataArray> {
  try {
    const raw = await readPref(); const j = JSON.parse(raw);
    if (!Array.isArray(j)) return [];
    return (j as Dict[]).map(rec => ({
      id: String(rec.id ?? ""), title: String(rec.title ?? ""),
      state: (rec.state ?? rec.content ?? null) as Json
    }));
  } catch { return []; }
}
async function writeAll(all: DataArray) { await atomicWrite(FILE, JSON.stringify(all, null, 2)); }
async function loadAll(): Promise<DataArray> { if (mem) return mem; mem = await readAll(); return mem!; }
async function saveAll(all: DataArray) { mem = all; await writeAll(all); }

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lock; let release!: () => void;
  lock = new Promise(r => (release = r)); await prev.catch(() => undefined);
  try { const out = await fn(); release(); return out; } catch (e) { release(); throw e; }
}

export async function listPages(): Promise<PageMeta[]> {
  const all = await loadAll(); return all.map(({ id, title }) => ({ id, title }));
}
export async function listPagesMeta(): Promise<PageMeta[]> { return listPages(); }

export async function getPageTitle(id: string) {
  const all = await loadAll(); return all.find(p => p.id === id)?.title;
}

export async function setPageTitle(id: string, title: string): Promise<PageMeta> {
  return withLock(async () => {
    const all = await loadAll(); const i = all.findIndex(p => p.id === id);
    if (i < 0) all.push({ id, title, state: null });
    else all[i] = { ...all[i], title };
    await saveAll(all); return { id, title };
  });
}

export async function getPageState(id: string): Promise<Json | undefined> {
  const all = await loadAll(); return all.find(p => p.id === id)?.state;
}

export async function setPageState(id: string, state: Json) {
  await withLock(async () => {
    const all = await loadAll(); const i = all.findIndex(p => p.id === id);
    if (i < 0) all.push({ id, title: "", state }); else all[i] = { ...all[i], state };
    await saveAll(all);
  });
}

export async function setPageStateWithTitle(id: string, title: string, state: Json): Promise<PageMeta> {
  return withLock(async () => {
    const all = await loadAll(); const i = all.findIndex(p => p.id === id);
    if (i < 0) all.push({ id, title, state }); else all[i] = { ...all[i], title, state };
    await saveAll(all); return { id, title };
  });
}

export async function debugSetAllPages(next: unknown): Promise<{ count:number }> {
  if (!Array.isArray(next)) throw new Error("debugSetAllPages: expected array");
  const arr: DataArray = (next as Dict[]).map(rec => ({
    id: String(rec.id ?? ""), title: String(rec.title ?? ""),
    state: (rec.state ?? rec.content ?? null) as Json
  }));
  await withLock(async () => { await ensureDir(FILE); await saveAll(arr); });
  return { count: arr.length };
}
