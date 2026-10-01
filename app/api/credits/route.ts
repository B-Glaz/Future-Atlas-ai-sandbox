import { NextResponse } from "next/server";
import { isSandboxSchemaError, sandboxCreditsRemaining } from "@/lib/ai/sandbox-credits";
import { withRequestLog } from "@/lib/security/request-log";

export const dynamic = "force-dynamic";

export const GET = withRequestLog(async function GET() {
  try {
    const credits_remaining = await sandboxCreditsRemaining();
    return NextResponse.json({ credits_remaining }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isSandboxSchemaError(error)) {
      return NextResponse.json({ credits_remaining: 0, pendingMigration: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Credit status unavailable." }, { status: 503 });
  }
});
