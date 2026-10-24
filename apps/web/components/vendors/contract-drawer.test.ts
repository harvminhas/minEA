import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DRAFT_CONTRACT_ID, draftContract, isDraftContract } from "../../lib/contracts";

const drawer = readFileSync(new URL("./ContractDrawer.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("./VendorsHub.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../nav/TopNav.tsx", import.meta.url), "utf8");

const zOf = (src: string, re: RegExp) => {
  const m = src.match(re);
  assert.ok(m, `no match for ${re}`);
  const z = m[1].startsWith("[") ? Number(m[1].slice(1, -1)) : Number(m[1]);
  return z;
};

test("contract drawer is portalled to <body> and stacks above the fixed top nav", () => {
  assert.match(drawer, /createPortal\(/);
  assert.match(drawer, /document\.body/);
  const navZ = zOf(nav, /<header className="fixed top-0[^"]*\bz-(\d+|\[\d+\])/);
  const drawerZ = zOf(drawer, /fixed inset-0 z-(\d+|\[\d+\])/);
  assert.ok(drawerZ > navZ, `drawer z ${drawerZ} must beat nav z ${navZ}`);
});

test("contract drawer fits the viewport and scrolls only its middle", () => {
  assert.match(drawer, /h-\[100dvh\] max-h-screen[^"]*flex-col/);
  assert.match(drawer, /min-h-0 flex-1 overflow-y-auto/);
  // Header and buttons stay out of the scrolling part.
  assert.match(drawer, /flex shrink-0 items-start justify-between/);
  assert.match(drawer, /shrink-0 border-t/);
  assert.doesNotMatch(drawer, /fixed inset-0 z-40/);
});

test("+ Contract opens a draft drawer before any request, and blocks double creates", () => {
  const body = hub.slice(hub.indexOf("const addContract = async"), hub.indexOf("const addProduct"));
  const opened = body.indexOf("setOpenId(DRAFT_CONTRACT_ID)");
  assert.ok(opened > 0, "opens the draft");
  assert.ok(opened < body.indexOf("await party()"), "opens before creating the vendor");
  assert.ok(opened < body.indexOf("await actions.contract.create"), "opens before creating the contract");
  assert.match(body, /if \(creating\.current\) return;/);
  assert.match(hub, /openId === DRAFT_CONTRACT_ID \? draft/);
});

test("the whole '+ Add contract' row is the button, not just its first words", () => {
  assert.match(hub, /<button type="button" onClick=\{addContract\} className="block w-full[^>]*>\s*<span[^>]*>\+ Add contract<\/span> name, cost, renewal/);
});

test("draft contract carries the vendor's name and is read-only in the drawer", () => {
  const d = draftContract("Arctic Wolf", null);
  assert.equal(d.id, DRAFT_CONTRACT_ID);
  assert.equal(d.name, "Arctic Wolf contract");
  assert.deepEqual(d.items, []);
  assert.ok(isDraftContract(d));
  assert.ok(!isDraftContract({ id: "1d9f" }));
  assert.equal(draftContract(null).name, "New contract");
  assert.match(drawer, /<fieldset disabled=\{pending\}/);
  assert.match(drawer, /Creating…/);
});
