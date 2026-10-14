import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/add/AddCards.tsx", import.meta.url), "utf8");
const between = (from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
const calls = (code: string) => (code.match(/(objectsApi|relationshipsApi|addApi)\.\w+\(/g) ?? []).length;
// A request inside a for-loop is one request per app.
const loops = (code: string) => /for \([^)]*\) \{[^}]*(objectsApi|relationshipsApi|addApi)\./.test(code);

test("the wizard makes no per-app requests anywhere", () => {
  assert.doesNotMatch(src, /objectsApi|relationshipsApi/);
  assert.equal(loops(src), false);
});

test("step 1 (Next): the shared panel saves once; leftovers go in one batch", () => {
  const save = panel.slice(panel.indexOf("const save = async"), panel.indexOf("const submitSeen"));
  assert.equal(calls(save), 1);
  const create = between("const createApps", "const aiSave");
  assert.equal(calls(create), 1);
  assert.match(create, /if \(pending\.length > 0\)/);
});

test("step 2: one batch for all AI answers (was one PUT per app), step 3 opens at once and waits on it", () => {
  const ai = between("const saveAi", "// Step 3 saves");
  assert.equal(calls(ai), 1);
  assert.match(ai, /overwrite: true/);
  assert.match(ai, /setStep\(2\);\n        setError/);
  assert.match(src, /const linkServers = async \(\) => \{\n    if \(aiSave\.current\) await aiSave\.current;/);
});

test("step 4: one batch for owners, renewals, licences and cost (was 7 PUTs for 7 apps), in row order", () => {
  const finish = between("const finish = async", "const run = async");
  assert.equal(calls(finish), 1);
  assert.match(finish, /if \(aiSave\.current\) await aiSave\.current;\n    if \(whereSave\.current\) await whereSave\.current;/);
  assert.match(finish, /Saving owners and renewals/);
  assert.match(finish, /canonicalOwner\(app\.ownerTeam/);
  assert.match(src, /await Promise\.allSettled\(\[aiSave\.current, whereSave\.current\]/);
});
