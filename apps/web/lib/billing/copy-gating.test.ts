import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  inviteUpgradeMessage,
  objectCreateBlockedMessage,
  shareCreateBlockedMessage,
  workspaceCreateBlockedMessage,
} from "../plan-features.ts";

const saved = process.env.NEXT_PUBLIC_BILLING_UI;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_BILLING_UI;
  else process.env.NEXT_PUBLIC_BILLING_UI = saved;
});

function messages(): string[] {
  return [
    inviteUpgradeMessage("free"),
    objectCreateBlockedMessage("free", 50),
    objectCreateBlockedMessage("business", null),
    shareCreateBlockedMessage("free", 1),
    workspaceCreateBlockedMessage("free", 1),
  ];
}

test("flag off: in-app upgrade copy is exactly today's", () => {
  process.env.NEXT_PUBLIC_BILLING_UI = "0";
  assert.deepEqual(messages(), [
    "Inviting teammates requires a Business plan. Contact us for a quote based on contributor licenses.",
    "Free includes up to 50 repository objects. Contact us for Business to add more.",
    "Repository object limit reached. Contact us to adjust your plan.",
    "Free includes one active share link. Contact us for Business for more, or revoke an existing link first.",
    "Free includes one workspace. Contact us for Business to create more workspaces, or join unlimited workspaces shared with you by others.",
  ]);
});

test("flag on: no Contact us sales copy, points to Plan & billing", () => {
  process.env.NEXT_PUBLIC_BILLING_UI = "1";
  const all = messages();
  for (const m of all) assert.doesNotMatch(m, /contact us|talk to us|guided onboarding/i);
  assert.match(all[0]!, /Starter, Team or Business/);
  assert.match(all[1]!, /Plan & billing/);
  assert.match(all[3]!, /Plan & billing/);
  assert.match(all[4]!, /Plan & billing/);
});
