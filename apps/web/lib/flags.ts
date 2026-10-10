/** firstrun.v1. Off means today's Ask home. Set NEXT_PUBLIC_FIRSTRUN=1 or 0 to override. */
export function firstRunEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_FIRSTRUN;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/** addanywhere.v1. Requires firstrun.v1. Off means today's add buttons. */
export function addAnywhereEnabled(): boolean {
  if (!firstRunEnabled()) return false;
  const flag = process.env.NEXT_PUBLIC_ADDANYWHERE;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * ask.stream.v1: Ask reads POST /ai/ask/stream (live working steps, then checked text in chunks).
 * On in `next dev`; OFF in production builds unless NEXT_PUBLIC_ASK_STREAM=1. 0 forces it off.
 */
export function askStreamEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ASK_STREAM;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return process.env.NODE_ENV !== "production";
}
