import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  cardsThatFit,
  limitLink,
  limitOffer,
  limitPanelCopy,
  limitState,
  ObjectLimitError,
  objectLimitDetail,
  objectLimitFromError,
  objectLimitToastCopy,
  partialSummary,
  pendingAppCount,
  restLink,
  roomFromDetail,
  roomHintText,
  takeFirst,
  type ObjectLimitDetail,
} from "./object-limit.ts";

const saved = process.env.NEXT_PUBLIC_BILLING_UI;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_BILLING_UI;
  else process.env.NEXT_PUBLIC_BILLING_UI = saved;
});

const refused: ObjectLimitDetail = { code: "limit_exceeded", limit: "max_objects_per_workspace", current: 0, max: 50, adding: 120, remaining: 50, plan: "free" };

test("the 403 detail is recognised from the body, the error, and a raw message", () => {
  assert.deepEqual(objectLimitDetail(refused), refused);
  assert.equal(objectLimitDetail({ code: "limit_exceeded", limit: "max_workspaces", current: 1, max: 1 }), null);
  assert.equal(objectLimitDetail("nope"), null);
  assert.deepEqual(objectLimitFromError(new ObjectLimitError(refused, "/x")), refused);
  assert.deepEqual(objectLimitFromError(new Error(`403 ${JSON.stringify(refused)} (/orgs/a/workspaces/b/objects/batch)`)), refused);
  assert.equal(objectLimitFromError(new Error("403 Not a member (/orgs/a)")), null);
  assert.equal(objectLimitFromError(new Error("500 boom")), null);
});

test("the error message is friendly, never raw JSON", () => {
  process.env.NEXT_PUBLIC_BILLING_UI = "1";
  const err = new ObjectLimitError({ ...refused, current: 50, adding: 1, remaining: 0 });
  assert.equal(err.status, 403);
  assert.doesNotMatch(err.message, /limit_exceeded|\{/);
  assert.match(err.message, /^Free includes up to 50 items \(apps, platforms, servers…\) in a workspace\. Upgrade in Settings → Plan & billing to add more\.$/);
});

test("offer: owner/admin with checkout open, checkout closed, flag off, member or unverified", () => {
  assert.equal(limitOffer({ can_manage_billing: true, paid_plans_available: true }, true), "upgrade");
  assert.equal(limitOffer({ can_manage_billing: true }, true), "upgrade");
  assert.equal(limitOffer({ can_manage_billing: true, paid_plans_available: false }, true), "checkout-closed");
  assert.equal(limitOffer({ can_manage_billing: true, paid_plans_available: true }, false), "business");
  assert.equal(limitOffer({ can_manage_billing: false, paid_plans_available: true }, true), "ask-admin");
  assert.equal(limitOffer(undefined, true), "ask-admin");
  assert.deepEqual(limitLink("upgrade", "acme"), { label: "Upgrade to Starter", href: "/orgs/acme/settings?tab=billing&start=starter" });
  assert.match(limitLink("checkout-closed", "acme")!.href, /^\/business\/get-started\?org=acme&from=add_limit$/);
  assert.match(limitLink("business", "acme")!.label, /Business/);
  assert.equal(limitLink("ask-admin", "acme"), null);
});

test("room: 120 pasted on an empty Free workspace fit 50; the server's override wins over the plan default", () => {
  const limit = limitState({ plan: "free", catalogCount: 0, adding: 120, offer: "upgrade", orgSlug: "acme" })!;
  assert.equal(limit.max, 50);
  assert.equal(limit.room, 50);
  assert.equal(limit.over, true);
  assert.equal(limit.fitCards, 50);
  assert.equal(roomHintText(limit), "50 left on Free");
  const custom = limitState({ plan: "free", room: { limit: "max_objects_per_workspace", current: 12, max: 30, remaining: 18, plan: "free" }, catalogCount: 10, adding: 5, offer: "upgrade", orgSlug: "acme" })!;
  assert.equal(custom.max, 30);
  assert.equal(custom.room, 18);
  assert.equal(custom.over, false);
  assert.equal(limitState({ plan: "starter", catalogCount: 0, adding: 500, offer: "upgrade", orgSlug: "acme" }), null);
  assert.equal(limitState({ plan: "free", room: { limit: "max_objects_per_workspace", current: 3, max: null, remaining: null, plan: "starter" }, catalogCount: 0, adding: 500, offer: "upgrade", orgSlug: "acme" }), null);
});

test("room: the catalogue count covers a room query that lags a save", () => {
  const limit = limitState({ plan: "free", room: { limit: "max_objects_per_workspace", current: 0, max: 50, remaining: 50, plan: "free" }, catalogCount: 50, adding: 1, offer: "upgrade", orgSlug: "a" })!;
  assert.equal(limit.room, 0);
  assert.equal(limit.over, true);
  assert.equal(roomHintText(limit), "Free is full (50 of 50)");
});

test("50 stored: the 51st is over; a workspace already over has no room", () => {
  const full = limitState({ plan: "free", catalogCount: 50, adding: 1, offer: "upgrade", orgSlug: "a" })!;
  assert.equal(full.over, true);
  assert.equal(full.fitCards, 0);
  const over = limitState({ plan: "free", catalogCount: 60, adding: 3, offer: "ask-admin", orgSlug: "a" })!;
  assert.equal(over.room, 0);
  assert.equal(limitPanelCopy(over, "$149/month").title, "This workspace is over the Free limit of 50 items");
});

test("cards that bring extra items (a new cloud tenant) fit by items, not by card count", () => {
  // Card 1 also creates a tenant: 2 items, then 1 per card.
  const itemsFor = (k: number) => (k === 0 ? 0 : k + 1);
  assert.equal(cardsThatFit(10, itemsFor, 5), 4);
  assert.equal(cardsThatFit(10, itemsFor, 0), 0);
  assert.equal(cardsThatFit(3, itemsFor, 100), 3);
  const limit = limitState({ plan: "free", catalogCount: 45, adding: 11, cards: 10, itemsFor, offer: "upgrade", orgSlug: "a" })!;
  assert.equal(limit.fitCards, 4);
});

test("panel copy: near the cap, full, and the footnote counts cards", () => {
  const near = limitState({ plan: "free", catalogCount: 40, adding: 25, offer: "upgrade", orgSlug: "a" })!;
  const copy = limitPanelCopy(near, "$149/month");
  assert.equal(copy.title, "Free covers up to 50 items in a workspace");
  assert.equal(copy.body, "You have 40 and are adding 25, so 10 fit. Starter ($149/month) has no item limit.");
  assert.equal(copy.footnote, "The other 15 stay on the cards, so you can add them after upgrading. Nothing is saved until you choose.");
  const full = limitPanelCopy(limitState({ plan: "free", catalogCount: 50, adding: 70, offer: "upgrade", orgSlug: "a" })!, "$149/month");
  assert.equal(full.title, "Free is full: 50 of 50 items");
  assert.match(full.body, /^70 items are waiting on the cards below\./);
  assert.equal(full.footnote, "They stay on the cards, so you can add them after upgrading.");
});

test("add the first N keeps paste order and takes rows already in the map along", () => {
  const rows = [
    { key: "a", existing: null },
    { key: "x", existing: { id: "1" } },
    { key: "b", existing: null },
    { key: "c", existing: null },
  ];
  const { planned, taken, fresh } = takeFirst(rows, 2);
  assert.deepEqual(planned.map((row) => row.key), ["a", "x", "b"]);
  assert.deepEqual([...taken], ["a", "b"]);
  assert.equal(fresh, 3);
  assert.equal(takeFirst(rows).planned.length, 4);
  assert.equal(partialSummary(50, 69), "Added 50 apps. 69 not added (Free is full)");
  assert.equal(partialSummary(1, 2, "Free", "platforms"), "Added 1 platform. 2 not added (Free is full)");
});

test("toast copy per offer; a 403 fills the same state as the pre-check", () => {
  const detail = { ...refused, current: 50, adding: 1, remaining: 0 };
  assert.deepEqual(objectLimitToastCopy(detail, "upgrade"), {
    title: "Free is full: 50 of 50 items",
    description: "Free includes up to 50 items (apps, platforms, servers…) in a workspace. Starter has no item limit.",
  });
  assert.match(objectLimitToastCopy(detail, "ask-admin").description, /Ask an owner or admin/);
  assert.match(objectLimitToastCopy({ ...detail, current: 60 }, "upgrade").title, /over the Free limit of 50/);
  for (const offer of ["upgrade", "checkout-closed", "business", "ask-admin"] as const) {
    assert.doesNotMatch(Object.values(objectLimitToastCopy(detail, offer)).join(" "), /contact (us|sales)|\{|limit_exceeded/i);
  }
  const room = roomFromDetail(refused);
  assert.deepEqual(room, { limit: "max_objects_per_workspace", current: 0, max: 50, remaining: 50, plan: "free" });
  assert.equal(limitState({ plan: "free", room, catalogCount: 0, adding: 120, offer: "upgrade", orgSlug: "a" })!.fitCards, 50);
});

test("after Add the first N: a quiet link per offer, none for people who can't buy", () => {
  assert.deepEqual(restLink("upgrade", "acme"), { label: "Upgrade to add the rest", href: "/orgs/acme/settings?tab=billing&start=starter" });
  assert.match(restLink("business", "acme")!.label, /Business/);
  assert.match(restLink("checkout-closed", "acme")!.label, /quote/);
  assert.equal(restLink("ask-admin", "acme"), null);
});

test("setup pill counts only the new apps the cards will still save", () => {
  const types = ["application", "application", "cloud_service", "application"];
  assert.equal(pendingAppCount(types, null, false), 3);
  assert.equal(pendingAppCount(types, { over: true, fitCards: 2 }, false), 2);
  // Chose "Add the first N": the waiting ones won't be saved by Next.
  assert.equal(pendingAppCount(types, { over: true, fitCards: 0 }, true), 0);
  assert.equal(pendingAppCount(types, null, true), 0);
});
