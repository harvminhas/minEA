/**
 * Dev only: when React warns "Encountered two children with the same key", log the key and the
 * component stack on one clear line, and keep them in window.__bubomapDuplicateKeys so a live test
 * can copy them out. Never installed in production builds.
 */
export type DuplicateKeyHit = { key: string; stack: string; at: string };

export function duplicateKeyFrom(args: unknown[]): string | null {
  const text = args.map((arg) => (typeof arg === "string" ? arg : "")).join(" ");
  if (!/two children with the same key/.test(text)) return null;
  const quoted = text.match(/same key, `([^`]*)`/);
  if (quoted && quoted[1] !== "%s") return quoted[1];
  // React 18 style: the key is the first %s argument after the message.
  const fmt = typeof args[0] === "string" ? args[0] : "";
  return fmt.includes("%s") && typeof args[1] === "string" ? args[1] : "(unknown)";
}

export function installDuplicateKeyProbe(target: Console = console): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const w = window as unknown as { __bubomapDuplicateKeys?: DuplicateKeyHit[]; __bubomapProbe?: boolean };
  if (w.__bubomapProbe) return;
  w.__bubomapProbe = true;
  w.__bubomapDuplicateKeys = [];
  const original = target.error.bind(target);
  target.error = (...args: unknown[]) => {
    const key = duplicateKeyFrom(args);
    if (key !== null) {
      const stack = args.filter((arg) => typeof arg === "string" && /\n\s+at /.test(arg)).join("\n") || new Error().stack || "";
      const hit = { key, stack, at: window.location.pathname + window.location.search };
      w.__bubomapDuplicateKeys?.push(hit);
      original(`[BuboMap dev] duplicate React key "${key}" on ${hit.at}\n${stack}`);
    }
    original(...args);
  };
}
