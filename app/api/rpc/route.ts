export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { rpcServer } from "@/lib/rpc-server";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(()=> ({} as any));
  if (typeof b?.key !== "string" || typeof b?.command !== "string") {
    return NextResponse.json({ ok:false, error:"key and command are required" }, { status:400 });
  }
  const args = Array.isArray(b.args) ? b.args : [];
  const kwargs = (b.kwargs && typeof b.kwargs === "object") ? b.kwargs : {};
  const out = await rpcServer(b.key, b.command, args, kwargs);
  return NextResponse.json(out);
}
