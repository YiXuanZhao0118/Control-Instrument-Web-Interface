// lib/rpc-client.ts
import type { RpcEnvelope } from "./rpc";

export type RpcResponse<T = unknown> =
  | { ok: true; result: T }
  | { ok: false; error: string };

export async function callRpc<T = unknown>(
  key: string,
  command: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {}
): Promise<RpcResponse<T>> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpointKey: key, command, args, kwargs }),
  });

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }

  const json = (await res.json()) as RpcEnvelope<T>;
  if ("ok" in json && json.ok === true) return json;
  return json as RpcResponse<T>;
}
