/** Resolve the FastAPI origin for fetch calls. */
export function resolveApiBase(): string {
  const strip = (url: string) => url.replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const publicUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (publicUrl) return strip(publicUrl);
    // Same-origin /api/v1/* — proxied by next.config.js rewrites (local dev).
    return "";
  }

  return strip(
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
  );
}

export function apiV1Url(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${resolveApiBase()}/api/v1${normalized}`;
}
