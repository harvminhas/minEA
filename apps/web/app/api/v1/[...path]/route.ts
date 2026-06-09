import { NextRequest, NextResponse } from "next/server";
import { proxyReachabilityHelp, resolveApiOrigin } from "@/lib/api-base";

export const runtime = "nodejs";
export const maxDuration = 30;

async function proxyToApi(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const upstreamPath = `/api/v1/${pathSegments.join("/")}${req.nextUrl.search}`;
  const origin = resolveApiOrigin();
  const upstreamUrl = `${origin}${upstreamPath}`;

  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") continue;
    headers.set(key, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };
  // Buffer body — streaming req.body with duplex fails on Vercel serverless for POST/PATCH.
  if (hasBody) {
    init.body = await req.arrayBuffer();
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
  let upstreamOrigin = process.env.API_URL?.trim() || "http://localhost:8000";
  try {
    upstreamOrigin = resolveApiOrigin();
    return await proxyToApi(req, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "API proxy failed";
    const hint =
      message === "fetch failed" ? proxyReachabilityHelp(upstreamOrigin.replace(/\/$/, "")) : message;
    console.error("[api proxy]", `/api/v1/${path.join("/")}`, upstreamOrigin, err);
    return NextResponse.json({ detail: hint }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
