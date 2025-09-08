// app/api/usb3104-analog/set/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { rpcServer } from "@/lib/rpc-server";

export async function POST(req: NextRequest) {
  const { channel, voltage } = await req.json().catch(()=> ({}));
  const ch = Number(channel); const v = Number(voltage);
  if (!Number.isInteger(ch) || ch < 0 || ch > 15) return NextResponse.json({ ok:false, error:"channel 0..15" }, { status:400 });
  if (!Number.isFinite(v)) return NextResponse.json({ ok:false, error:"voltage number" }, { status:400 });
  const out = await rpcServer("usb3104 analog", "set_analog_output", [ch, v], {});
  return NextResponse.json(out);
}
