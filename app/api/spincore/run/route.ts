// app/api/spincore/run/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getPageState } from "@/lib/dataStore";
import { rpcServer } from "@/lib/rpc-server";

type Timing = {
  label: string;
  "sequence type": string;
  "sequence times": number;
  "time range": number;     // float
  "time scale": string;     // "s" | "ms" | "us" | "ns"
  sequence: number[];       // 24 個 0/1
};

type Sequence = {
  name: string;
  comment: string;
  timing: Timing[];
};

type SpinCoreState = {
  "Initial pagination": number;
  "time scale": string[];
  "sequence type": string[];
  "Channel name": string[];
  Sequence: Sequence[];
};

export async function POST(req: NextRequest) {
  const { seqIndex } = await req.json().catch(() => ({} as { seqIndex?: number }));
  const st = (await getPageState("3")) as SpinCoreState | undefined;

  if (!st || !Array.isArray(st.Sequence)) {
    return NextResponse.json({ error: "SpinCore state not found (page id 3)" }, { status: 404 });
  }

  const idx = Number.isFinite(seqIndex) ? Number(seqIndex) : Number(st["Initial pagination"] ?? 0) || 0;
  const seq = st.Sequence[idx];
  if (!seq) {
    return NextResponse.json({ error: `Invalid seqIndex ${idx}` }, { status: 400 });
  }
  const data: Timing[] = Array.isArray(seq.timing) ? seq.timing : [];

  try {
    // 預設使用 kwargs 形式：{ data: [...] }。
    // 如果你的 Python 端只吃 args，請改成：
    //   await rpcServer("spincore", "execute", [data], {});
    const result = await rpcServer("spincore", "execute", [], { data });
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
