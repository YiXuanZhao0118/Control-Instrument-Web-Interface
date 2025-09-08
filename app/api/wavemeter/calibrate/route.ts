// app/api/wavemeter/calibrate/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { rpcServer } from "@/lib/rpc-server";
export async function POST() {
  const out = await rpcServer("Highfinesse wavemeter", "calibrate", [],{"source_type": "other", "source_frequency":351.721835});
  return NextResponse.json(out);
}
