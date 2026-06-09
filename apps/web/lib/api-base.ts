/**
 * Browser always calls same-origin /api/v1/* (proxied to FastAPI).
 * Server-side code uses API_URL directly.
 */

function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function resolveApiOrigin(): string {
  const configured = process.env.API_URL?.trim();
  if (configured) {
    if (isProductionRuntime() && /localhost|127\.0\.0\.1/i.test(configured)) {
      throw new Error(
        "API_URL cannot point to localhost in production. Set API_URL to your deployed API " +
          "(e.g. https://min-ea-api.vercel.app) on the web project, then redeploy."
      );
    }
    return configured.replace(/\/$/, "");
  }
  if (isProductionRuntime()) {
    throw new Error(
      "API_URL is not set on the web deployment. Add API_URL=https://min-ea-api.vercel.app " +
        "to the web project environment (Production), then redeploy."
    );
  }
  return "http://localhost:8000";
}

export function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return resolveApiOrigin();
}

export function apiV1Url(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${resolveApiBase()}/api/v1${normalized}`;
}

export function isDeployedWebApp(): boolean {
  if (typeof window === "undefined") return Boolean(process.env.VERCEL);
  const host = window.location.hostname;
  return host.endsWith(".vercel.app") || host.endsWith(".vercel.sh");
}

export function apiConfigHelpText(): string {
  if (isDeployedWebApp()) {
    return (
      "Set API_URL on the Vercel web project (not the API project): " +
      "API_URL=https://min-ea-api.vercel.app — no trailing slash, Production environment, then redeploy web."
    );
  }

  return (
    "Local dev: set API_URL=http://localhost:8000 in apps/web/.env.local and run npm run dev " +
    "from the repo root so the API is up on port 8000."
  );
}

export function proxyReachabilityHelp(upstreamOrigin: string): string {
  if (isProductionRuntime()) {
    return (
      `Could not reach the API at ${upstreamOrigin}. Verify API_URL on the web project points to your ` +
      "live API (https://min-ea-api.vercel.app), open that URL /health, then redeploy the web app."
    );
  }
  return (
    "Could not reach the API. Ensure the API is running (npm run dev) and " +
    "API_URL=http://localhost:8000 in apps/web/.env.local."
  );
}

export function apiBaseLabel(): string {
  if (typeof window !== "undefined") {
    return "/api/v1/* → API_URL (runtime proxy on server)";
  }
  return resolveApiBase();
}
