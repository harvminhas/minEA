import assert from "node:assert/strict";
import { test } from "node:test";
import { savesPending, savesWaiting, trackSave } from "./save-queue.ts";

test("quick saves on one record go out at once, and only the last one to finish is applied", async () => {
  const log: string[] = [];
  let openJob: () => void = () => undefined;
  let openTrigger: () => void = () => undefined;
  const jobGate = new Promise<void>((resolve) => {
    openJob = resolve;
  });
  const triggerGate = new Promise<void>((resolve) => {
    openTrigger = resolve;
  });

  const job = trackSave("agent-1", async () => {
    log.push("start job");
    await jobGate;
  });
  const trigger = trackSave("agent-1", async () => {
    log.push("start trigger");
    await triggerGate;
  });

  assert.deepEqual(log, ["start job", "start trigger"]);
  assert.equal(savesWaiting("agent-1"), 2);
  assert.equal(savesPending(), 2);

  openJob();
  await job;
  assert.equal(savesWaiting("agent-1"), 1);

  openTrigger();
  await trigger;
  assert.equal(savesWaiting("agent-1"), 0);
  assert.equal(savesPending(), 0);
});

test("a failed save still counts down, and records are counted apart", async () => {
  let openFail: () => void = () => undefined;
  let openApp: () => void = () => undefined;
  const failGate = new Promise<void>((resolve) => {
    openFail = resolve;
  });
  const appGate = new Promise<void>((resolve) => {
    openApp = resolve;
  });

  const failing = trackSave("agent-2", async () => {
    await failGate;
    throw new Error("nope");
  });
  const other = trackSave("app-9", async () => {
    await appGate;
    return "app";
  });

  assert.equal(savesWaiting("agent-2"), 1);
  assert.equal(savesWaiting("app-9"), 1);

  openFail();
  openApp();
  await assert.rejects(failing);
  assert.equal(await other, "app");
  assert.equal(savesWaiting("agent-2"), 0);
  assert.equal(savesWaiting("app-9"), 0);
  assert.equal(savesPending(), 0);
});
