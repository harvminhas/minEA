/**
 * Browser always calls same-origin /api/v1/* (proxied to FastAPI).
 * Server-side code uses API_URL directly.
 */
export function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const configured = process.env.API_URL?.trim();
  return (configured ?? "http://localhost:8000").replace(/\/$/, "");
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

export function apiBaseLabel(): string {
  if (typeof window !== "undefined") {
    return "/api/v1/* → API_URL (runtime proxy on server)";
  }
  return resolveApiBase();
}
