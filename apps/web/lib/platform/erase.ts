import type { ErasePreview } from "@/lib/api-client";

/** Why the Erase button is off ("" = ready). Mirrors the server checks; the server re-checks them all. */
export function eraseBlockReason(preview: ErasePreview | null, typed: string, acknowledged: boolean): string {
  if (!preview) return "Loading the preview…";
  if (preview.is_self) return "You can't erase your own account.";
  if (preview.is_platform_admin) return "Platform admins can't be erased here.";
  if (preview.blockers.length) return preview.blockers.join(" ");
  if (preview.needs_subscription_ack && !acknowledged) return "Acknowledge the Stripe subscription warning first.";
  if (typed.trim().toLowerCase() !== preview.user.email.trim().toLowerCase()) return "Type the user's full email exactly to confirm.";
  return "";
}

export function eraseErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const body = JSON.parse(match[0]) as { detail?: { message?: string } | string; message?: string };
      if (typeof body.detail === "object" && body.detail?.message) return body.detail.message;
      if (typeof body.message === "string") return body.message;
    } catch {
      // fall through
    }
  }
  return raw || "Could not erase.";
}

export const ORG_ACTION_LABEL = { delete: "Deleted with everything in it", leave: "Only their membership removed", blocked: "Blocked" } as const;
