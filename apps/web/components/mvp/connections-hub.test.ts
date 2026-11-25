import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const hub = readFileSync(new URL("./ConnectionsHub.tsx", import.meta.url), "utf8");
const layout = readFileSync(
  new URL("../../app/orgs/[orgSlug]/workspaces/[workspaceSlug]/layout.tsx", import.meta.url),
  "utf8",
);
const chat = readFileSync(new URL("../ai/ChatPanel.tsx", import.meta.url), "utf8");

test("Connections hub creates each type with the existing Create panels, not a new dialog", () => {
  assert.match(hub, /<CreateFlowPanel/);
  assert.match(hub, /<CreateApiPanel/);
  assert.match(hub, /<CreateEventPanel/);
  assert.match(hub, /<CreateIntegrationInfraPanel/);
  assert.match(hub, /data-testid="connections-add"/);
  assert.match(hub, /data-testid="connections-add-menu"/);
  assert.match(hub, /onPick=\{startCreate\}/);
  assert.doesNotMatch(hub, /CreateConnectionDialog|NewConnectionModal|one-off/);
  // All filter: pick the type from the standard Add menu; a typed filter opens that panel directly.
  assert.match(hub, /type !== "all"/);
  assert.match(hub, /creating === "flows"/);
  assert.match(hub, /creating === "apis"/);
  assert.match(hub, /creating === "events"/);
  assert.match(hub, /creating === "tools"/);
});

test("the floating AI button is hidden by a flag and the component is still there", () => {
  assert.match(chat, /export function ChatPanel/);
  assert.match(chat, /export const SHOW_FLOATING_AI_BUTTON = false/);
  assert.match(chat, /fixed bottom-6 right-6/);
  assert.match(layout, /SHOW_FLOATING_AI_BUTTON && !isEmbed && !leavingGoneWorkspace && <ChatPanel \/>/);
});
