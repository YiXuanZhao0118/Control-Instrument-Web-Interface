export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { listPagesMeta as listPages } from "@/lib/dataStore";

export async function GET() {
  return NextResponse.json(await listPages());
}
