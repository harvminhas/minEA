/**
 * Shared rule for NEXT_PUBLIC_* feature flags that default ON in local dev and OFF in
 * production builds: "1"/"true"/"on"/"yes" forces on, "0"/"false"/"off"/"no" forces off,
 * anything else (unset) follows NODE_ENV.
 */
const ON = new Set(["1", "true", "on", "yes"]);
const OFF = new Set(["0", "false", "off", "no"]);

export function devDefaultFlag(flag: string | undefined, nodeEnv: string | undefined): boolean {
  const value = flag?.trim().toLowerCase();
  if (value && ON.has(value)) return true;
  if (value && OFF.has(value)) return false;
  return nodeEnv !== "production";
}
