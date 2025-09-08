// lib/endpoints-store.ts
import fs from "node:fs/promises";
import path from "node:path";

const FILE = path.join(process.cwd(), "app", "data", "endpoints.json");

type Endpoint = { base: string; instrument: string };
type MapT = Record<string, Endpoint>;

let mem: MapT | null = null;

async function ensureDir() { await fs.mkdir(path.dirname(FILE), { recursive: true }); }
async function readAll(): Promise<MapT> {
  try { const raw = await fs.readFile(FILE, "utf-8"); const j = JSON.parse(raw);
    return (j && typeof j === "object" && !Array.isArray(j)) ? (j as MapT) : {}; } catch { return {}; }
}
async function writeAll(map: MapT) {
  await ensureDir(); const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf-8");
  try { await fs.rename(tmp, FILE); } catch { await fs.writeFile(FILE, JSON.stringify(map, null, 2), "utf-8"); await fs.rm(tmp, { force:true }); }
}
export async function listEndpoints(): Promise<MapT> { if (mem) return mem; mem = await readAll(); return mem!; }
export async function loadEndpoints(): Promise<MapT> { return listEndpoints(); }
export async function setEndpoint(key: string, ep: Endpoint) {
  const map = await listEndpoints(); map[key] = { base: String(ep.base), instrument: String(ep.instrument) }; await writeAll(map); mem = map;
}
