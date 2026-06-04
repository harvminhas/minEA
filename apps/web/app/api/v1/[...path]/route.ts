import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  // Node fetch decompresses gzip/br bodies but keeps Content-Encoding — browsers then fail
  // with ERR_CONTENT_DECODING_FAILED if we forward those headers unchanged.
  const hopByHop = new Set([
    "connection",
    "content-encoding",
    "content-length",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (hopByHop.has(key.toLowerCase())) return;
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
    const hint =
      message === "fetch failed"
        ? "Could not reach the API. Ensure the API is running (npm run dev) and API_URL=http://localhost:8000 in apps/web/.env.local."
        : message;
    console.error("[api proxy]", `/api/v1/${path.join("/")}`, err);
    return NextResponse.json({ detail: hint }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
