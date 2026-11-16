import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readSidebarCollapsed, SIDEBAR_COLLAPSED_KEY, writeSidebarCollapsed } from "./model-sidebar-collapsed";

test("the collapsed flag is stored per user", () => {
  assert.equal(SIDEBAR_COLLAPSED_KEY("user-1"), "bubomap-model-sidebar-collapsed:user-1");
  assert.equal(SIDEBAR_COLLAPSED_KEY(), "bubomap-model-sidebar-collapsed");
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  assert.equal(readSidebarCollapsed(storage, "user-1"), false);
  writeSidebarCollapsed(storage, true, "user-1");
  assert.equal(store.get(SIDEBAR_COLLAPSED_KEY("user-1")), "1");
  assert.equal(readSidebarCollapsed(storage, "user-1"), true);
  assert.equal(readSidebarCollapsed(storage, "user-2"), false);
});

test("the model sidebar has a collapse control, icon rail and tooltips", () => {
  const sidebar = readFileSync(new URL("../components/mvp/ModelSidebar.tsx", import.meta.url), "utf8");
  const view = readFileSync(new URL("../components/mvp/ModelSidebarView.tsx", import.meta.url), "utf8");
  const src = sidebar + view;
  assert.match(src, /data-testid="sidebar-collapse"/);
  assert.match(src, /w-\[60px\]/);
  assert.match(src, /w-\[232px\]/);
  assert.match(src, /PanelLeftClose/);
  assert.match(src, /PanelLeftOpen/);
  assert.match(src, /SlidersHorizontal/);
  assert.match(sidebar, /writeSidebarCollapsed/);
  assert.match(src, /showcaseTooltip/);
  assert.match(src, /data-testid="model-sidebar"/);
});
