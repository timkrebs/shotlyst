import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${serverEnv.cronSecret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Daily cron call: a small query that keeps the Supabase project active.
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse(null, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("app_settings")
    .select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
