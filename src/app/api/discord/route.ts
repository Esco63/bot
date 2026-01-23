export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ test: "GET_OK" });
}

export async function POST() {
  return NextResponse.json({ test: "POST_OK" });
}
