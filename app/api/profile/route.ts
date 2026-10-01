import { NextRequest, NextResponse } from "next/server";

import { resolveRequestAuth } from "@/lib/auth/request-auth";
import { isMissingTable, saveProfile } from "@/lib/platform/credits/daily";
import { withRequestLog } from "@/lib/security/request-log";
import { createRequestSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export const POST = withRequestLog(async function POST(request: NextRequest) {
  const auth = await resolveRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const client = createRequestSupabase(auth.token);
  const { data, error } = await client.auth.getUser(auth.token);
  if (error || !data.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const metadata = data.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const writeError = await saveProfile(data.user.id, data.user.email, metadata?.full_name || metadata?.name || null);
  if (writeError && isMissingTable(writeError)) return NextResponse.json({ error: "Profile storage is not ready." }, { status: 503 });
  if (writeError) return NextResponse.json({ error: "Could not save profile." }, { status: 503 });
  return new NextResponse(null, { status: 204 });
});
