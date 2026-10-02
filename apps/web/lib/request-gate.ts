/** How many API calls one browser may have in flight. Production Postgres rejects the rest. */
export const API_CONCURRENCY = 4;

const TRANSIENT = new Set([500, 502, 503, 504]);

export function shouldRetryRequest(method: string, status: number, attempt: number, maxAttempts: number): boolean {
  if (attempt >= maxAttempts - 1) return false;
  const verb = method.toUpperCase();
  if (verb !== "GET" && verb !== "HEAD") return false;
  return TRANSIENT.has(status);
}

export function createRequestGate(limit: number) {
  let inFlight = 0;
  const waiters: Array<() => void> = [];

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (inFlight >= limit) {
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
        });
      } else {
        inFlight += 1;
      }
      try {
        return await task();
      } finally {
        const next = waiters.shift();
        if (next) next();
        else inFlight -= 1;
      }
    },
  };
}

export const apiRequestGate = createRequestGate(API_CONCURRENCY);
