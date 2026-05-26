import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveApiOrigin(): string {
  const configured = process.env.API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL) {
    throw new Error(
      "API_URL is not set on the Vercel web project. Add API_URL=https://min-ea-api.vercel.app and redeploy."
    );
  }
  return "http://localhost:8000";
}

async function proxyToApi(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const upstreamPath = `/api/v1/${pathSegments.join("/")}${req.nextUrl.search}`;
  const upstreamUrl = `${resolveApiOrigin()}${upstreamPath}`;

  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") continue;
    headers.set(key, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half";
  }

  const upstream = await fetch(upstreamUrl, init);

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  try {
    return await proxyToApi(req, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "API proxy failed";
    return NextResponse.json({ detail: message }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
