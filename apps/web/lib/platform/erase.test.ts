import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eraseBlockReason, eraseErrorMessage } from "./erase";
import type { ErasePreview } from "@/lib/api-client";

const base = {
  user: { id: "u1", email: "Ann@Example.com" },
  orgs: [], counts: {}, blockers: [], needs_subscription_ack: false, is_self: false, is_platform_admin: false,
} as unknown as ErasePreview;

test("erase button needs the exact email", () => {
  assert.match(eraseBlockReason(base, "", false), /full email/);
  assert.match(eraseBlockReason(base, "ann@example.co", false), /full email/);
  assert.equal(eraseBlockReason(base, "ann@example.com", false), "");
});

test("self, platform admin, blockers and subscription all block", () => {
  assert.match(eraseBlockReason({ ...base, is_self: true }, "ann@example.com", true), /own account/);
  assert.match(eraseBlockReason({ ...base, is_platform_admin: true }, "ann@example.com", true), /Platform admins/);
  assert.match(eraseBlockReason({ ...base, blockers: ["Sole admin of Acme."] }, "ann@example.com", true), /Sole admin/);
  const sub = { ...base, needs_subscription_ack: true };
  assert.match(eraseBlockReason(sub, "ann@example.com", false), /Stripe/);
  assert.equal(eraseBlockReason(sub, "ann@example.com", true), "");
  assert.match(eraseBlockReason(null, "x", true), /Loading/);
});

test("server error detail is shown as plain text", () => {
  const err = new Error('409 {"code":"blocked","message":"Sole admin of Acme."} (/platform/admin/users/u1/erase)');
  assert.equal(eraseErrorMessage(err), "Sole admin of Acme.");
});

test("admin link lives only in the user menu and points at /platform", () => {
  const nav = readFileSync("components/nav/TopNav.tsx", "utf8");
  assert.match(nav, /platformAdmin[\s\S]{0,400}\/platform\/users/);
  const shell = readFileSync("components/platform/PlatformShell.tsx", "utf8");
  assert.match(shell, /\/platform\/catalog/);
  assert.match(shell, /\/platform\/users/);
  assert.match(readFileSync("components/platform/CatalogAdmin.tsx", "utf8"), /catalog-refresh/);
});

test("same-email accounts are grouped together; dialog erases all by default", async () => {
  const { groupByEmail } = await import("./erase");
  const g = groupByEmail([{ email: "a@x.com", id: 1 }, { email: "b@x.com", id: 2 }, { email: "A@x.com ", id: 3 }]);
  assert.deepEqual(g.map((x) => [x.email, x.rows.map((r) => r.id)]), [["a@x.com", [1, 3]], ["b@x.com", [2]]]);
  const dialog = readFileSync("components/platform/EraseUserDialog.tsx", "utf8");
  assert.match(dialog, /useState\(true\)/);
  assert.match(dialog, /all_accounts: allAccounts/);
  assert.match(readFileSync("components/platform/UsersAdmin.tsx", "utf8"), /\{n\} accounts/);
});
