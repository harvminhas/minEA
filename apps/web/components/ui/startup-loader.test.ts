import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  LOADER_FADE_MS,
  SLOW_AFTER_MS,
  STARTUP_AUTH_STEPS,
  STARTUP_HOME_STEPS,
  STARTUP_SHELL_STEPS,
  StartupLoader,
  stepLabel,
} from "./StartupLoader.tsx";
import { BuboMapWordmark } from "../brand/BuboMapLogo.tsx";

(globalThis as any).React = React;
const WEB = new URL("../../", import.meta.url).pathname;

test("status line uses the real steps, calm wording, no step counter", () => {
  assert.deepEqual(STARTUP_AUTH_STEPS.map((s) => s.label), ["Starting BuboMap", "Signing you in", "Preparing your workspace"]);
  assert.deepEqual(STARTUP_HOME_STEPS.map((s) => s.label), ["Loading your organisations", "Finding your workspace", "Opening your workspace"]);
  assert.deepEqual(STARTUP_SHELL_STEPS.map((s) => s.label), ["Loading your organisation", "Opening your workspace", "Almost ready"]);
  assert.equal(stepLabel(STARTUP_SHELL_STEPS, 9), "Almost ready");
  assert.equal(stepLabel(STARTUP_SHELL_STEPS, -1), "Loading your organisation");
  assert.equal(SLOW_AFTER_MS, 10_000);
  assert.equal(LOADER_FADE_MS, 300);
});

test("loading screen: owl, wordmark, one status line, shimmer bar; no fake progress, no beta", () => {
  const html = renderToStaticMarkup(React.createElement(StartupLoader, { stepIndex: 0, steps: STARTUP_SHELL_STEPS }));
  assert.match(html, /bm-owl-blink/);
  assert.match(html, /bm-owl-glow/);
  assert.match(html, />BuboMap</);
  assert.match(html, /Loading your organisation…/);
  assert.match(html, /bm-shimmer/);
  assert.doesNotMatch(html, /Step \d of \d/);
  assert.doesNotMatch(html, /width:\s*\d+%/);
  assert.doesNotMatch(html, /\bbeta\b/i);
  assert.doesNotMatch(html, /Taking longer than usual/);
});

test("slow state shows a quiet Retry; leaving fades out", () => {
  const slow = renderToStaticMarkup(React.createElement(StartupLoader, { stepIndex: 1, steps: STARTUP_AUTH_STEPS, slow: true }));
  assert.match(slow, /Taking longer than usual…/);
  assert.match(slow, /<button[^>]*>Retry<\/button>/);
  const leaving = renderToStaticMarkup(React.createElement(StartupLoader, { stepIndex: 2, leaving: true }));
  assert.match(leaving, /bm-loader-leaving/);
});

test("css: no flash under 300 ms, and motion stops under prefers-reduced-motion", () => {
  const css = readFileSync(join(WEB, "app/globals.css"), "utf8");
  assert.match(css, /\.bm-loader-content \{ animation: bm-fade-in \d+ms ease-out 300ms both; \}/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.bm-owl-glow, \.bm-owl-blink, \.bm-shimmer \{ animation: none; \}/);
});

test("the wordmark has no beta badge", () => {
  const html = renderToStaticMarkup(React.createElement(BuboMapWordmark, { size: "md", theme: "dark" }));
  assert.doesNotMatch(html, /beta/i);
});

test("no beta badge anywhere in app or marketing source", () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts")) {
        const text = readFileSync(path, "utf8");
        if (/\bbeta\s*(=|\})|>\s*beta\s*<|\.beta\b|\(beta\)|\bBeta\b(?!["'])/.test(text)) hits.push(path.replace(WEB, ""));
      }
    }
  };
  for (const dir of ["app", "components"]) walk(join(WEB, dir));
  // Product lifecycle "beta" (portfolio data) is a domain value, not the app badge.
  const allowed = ["components/views/PortfolioTable.tsx"];
  assert.deepEqual(hits.filter((h) => !allowed.includes(h)), []);
});
