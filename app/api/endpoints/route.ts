export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { listEndpoints, setEndpoint, loadEndpoints } from "@/lib/endpoints-store";

export async function GET() {
  return NextResponse.json(await listEndpoints());
}

// Admin 改成一次 PUT 多個 key
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  for (const [k, v] of Object.entries(body)) {
    const rec = v as { base?: string; instrument?: string };
    if (!rec?.base || !rec?.instrument) {
      return NextResponse.json({ error: `endpoint ${k} invalid` }, { status: 400 });
    }
    await setEndpoint(String(k), { base: String(rec.base), instrument: String(rec.instrument) });
  }
  return NextResponse.json(await loadEndpoints());
}
