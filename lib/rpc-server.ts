// lib/rpc-server.ts
import { listEndpoints } from "@/lib/endpoints-store";
import { ok, err, RpcEnvelope } from "@/lib/rpc";

function normalizeBase(x: string): string {
  let s = (x || "").trim();
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  return s.replace(/\/+$/, "");
}

export async function rpcServer(
  key: string,
  command: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
  timeoutMs = 15000
): Promise<RpcEnvelope> {
  const endpoints = await listEndpoints();
  const ep = endpoints[key];
  if (!ep?.base || !ep?.instrument) {
    return err(`endpoint '${key}' not configured`);
  }
  const url = `${normalizeBase(ep.base)}/rpc`;
  const payload = { instrument: ep.instrument, command, args, kwargs };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    // （可選）開發時印出 payload 幫你除錯
    console.log("[rpc] →", url, JSON.stringify(payload));

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });

    const text = await res.text();

    // 非 2xx
    if (!res.ok) {
      console.error("[rpc] HTTP error", res.status, res.statusText, text.slice(0, 200));
      return err(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
    }

    // 解析 JSON
    let j: any;
    try {
      j = JSON.parse(text);
    } catch {
      console.error("[rpc] not JSON:", text.slice(0, 200));
      return err(`Server did not return JSON: ${text.slice(0, 200)}`);
    }

    // 和你的 client.py 一致：期待有 ok 欄位
    if (j && typeof j === "object" && "ok" in j) {
      console.log("[rpc] ←", JSON.stringify(j));
      return j as RpcEnvelope;
    }

    // 有些伺服器可能直接回 result，保底處理
    console.warn("[rpc] response has no 'ok', wrapping as ok:", j);
    return ok(j);
  } catch (e: any) {
    if (e?.name === "AbortError") return err(`RPC timeout after ${timeoutMs}ms`);
    console.error("[rpc] fetch failed:", e);
    return err(`fetch failed: ${e?.message ?? String(e)}`);
  } finally {
    clearTimeout(t);
  }
}
