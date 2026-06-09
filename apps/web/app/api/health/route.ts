import { NextResponse } from "next/server";
import { resolveApiOrigin } from "@/lib/api-base";

export const runtime = "nodejs";

/** Quick check that the web app can reach the configured API (use after deploy). */
export async function GET() {
  let apiOrigin = "";
  try {
    apiOrigin = resolveApiOrigin();
    const res = await fetch(`${apiOrigin}/health`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    return NextResponse.json({
      web: "ok",
      api_url: apiOrigin,
      api_reachable: res.ok,
      api_status: res.status,
      api_health: body,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "API health check failed";
    return NextResponse.json(
      {
        web: "ok",
        api_url: apiOrigin || process.env.API_URL?.trim() || null,
        api_reachable: false,
        error: message,
      },
      { status: 503 }
    );
  }
}
