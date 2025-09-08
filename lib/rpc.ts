// lib/rpc.ts
export interface RpcRequestEnvelope { key: string; command: string; args?: unknown[]; kwargs?: Record<string, unknown>; }
export type RpcOk<T=unknown> = { ok:true; result:T };
export type RpcErr = { ok:false; error:string };
export type RpcEnvelope<T=unknown> = RpcOk<T> | RpcErr;
export const ok = <T>(result:T): RpcOk<T> => ({ ok:true, result });
export const err = (message:string): RpcErr => ({ ok:false, error:message });
