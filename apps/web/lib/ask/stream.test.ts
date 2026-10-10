/** Ask step 2: the browser stream reader for POST /ai/ask/stream. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SseParser, askWithStream, readAskStream } from "./stream.ts";
import { askStreamEnabled } from "../flags.ts";
import { catalogStats, rowFromObject, vendorKeysFor } from "../model-catalog.ts";

const enc = new TextEncoder();
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const FINAL = { source: "llm", answer_text: "Two renew [1].", citations: [], gaps: [], follow_ups: ["x"], tools_used: [] };

function response(parts: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(enc.encode(part));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { "content-type": "text/event-stream" } });
}

test("parser: frames split across chunks, comments, \\r\\n and multi-line data", () => {
  const p = new SseParser();
  assert.deepEqual(p.feed("event: st"), []);
  assert.deepEqual(p.feed("ep\r\ndata: {\"a\":1}\r"), []);
  assert.deepEqual(p.feed("\n\r\n: ping\r\n\r\n"), [{ event: "step", data: "{\"a\":1}" }]);
  assert.deepEqual(p.feed("data: line1\ndata: line2\n\n"), [{ event: "message", data: "line1\nline2" }]);
});

test("reader: live steps in order, text grows chunk by chunk, returns the final payload", async () => {
  const steps: string[] = [];
  const texts: string[] = [];
  const whole = frame("meta", { version: 1 }) + ": ping\n\n" + frame("step", { id: "estate", status: "done", label: "Read" }) +
    frame("step", { id: "tool-1", status: "done", label: "Found 2" }) + frame("delta", { text: "Two " }) + frame("delta", { text: "renew [1]." }) +
    frame("final", FINAL) + frame("done", {});
  // Split at awkward places, including inside a frame.
  const parts = [whole.slice(0, 7), whole.slice(7, 61), whole.slice(61, 140), whole.slice(140)];
  const payload = await readAskStream(response(parts), { onStep: (s) => steps.push(s.id), onText: (t) => texts.push(t) });
  assert.deepEqual(steps, ["estate", "tool-1"]);
  assert.deepEqual(texts, ["Two ", "Two renew [1]."]);
  assert.equal(payload.answer_text, "Two renew [1].");
});

test("askWithStream falls back to /ai/ask exactly once on a truncated stream, an error frame, or a bad status", async () => {
  const cases = [
    response([frame("meta", { version: 1 }), frame("step", { id: "estate", status: "done", label: "Read" })]),
    response([frame("meta", { version: 1 }), frame("error", { code: "stream_failed" }), frame("done", {})]),
    response([frame("done", {})]),
    response(["nope"], 502),
  ];
  for (const res of cases) {
    let fallbacks = 0;
    const payload = await askWithStream({
      url: "/x", token: "t", question: "q",
      fetchImpl: async () => res,
      fallback: async () => { fallbacks += 1; return { ...FINAL, answer_text: "from json" } as never; },
    });
    assert.equal(fallbacks, 1);
    assert.equal(payload.answer_text, "from json");
  }
  let fallbacks = 0;
  await askWithStream({ url: "/x", token: "t", question: "q", fetchImpl: async () => { throw new Error("network"); }, fallback: async () => { fallbacks += 1; return FINAL as never; } });
  assert.equal(fallbacks, 1);
});

test("a good stream never calls the fallback", async () => {
  let fallbacks = 0;
  await askWithStream({ url: "/x", token: "t", question: "q", fetchImpl: async () => response([frame("final", FINAL), frame("done", {})]), fallback: async () => { fallbacks += 1; return FINAL as never; } });
  assert.equal(fallbacks, 0);
});

test("NEXT_PUBLIC_ASK_STREAM: on in dev, off in production unless 1, 0 forces off", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, flag: env.NEXT_PUBLIC_ASK_STREAM };
  try {
    delete env.NEXT_PUBLIC_ASK_STREAM;
    env.NODE_ENV = "development"; assert.equal(askStreamEnabled(), true);
    env.NODE_ENV = "production"; assert.equal(askStreamEnabled(), false);
    env.NEXT_PUBLIC_ASK_STREAM = "1"; assert.equal(askStreamEnabled(), true);
    env.NODE_ENV = "development"; env.NEXT_PUBLIC_ASK_STREAM = "0"; assert.equal(askStreamEnabled(), false);
  } finally {
    env.NODE_ENV = saved.node;
    if (saved.flag === undefined) delete env.NEXT_PUBLIC_ASK_STREAM; else env.NEXT_PUBLIC_ASK_STREAM = saved.flag;
  }
});

test("vendors: one definition (vendor field + cost lines, no hosting words), servers included", () => {
  assert.deepEqual(vendorKeysFor({ vendor: "Microsoft", cost_lines: [{ vendor: "microsoft" }, { vendor: "CDW" }, { type: "internal_estimate", vendor: "Us" }] }), ["microsoft", "cdw"]);
  assert.deepEqual(vendorKeysFor({ vendor: "saas" }), []);
  const obj = (id: string, type: string, properties: Record<string, unknown>) => ({ id, type, name: id, properties }) as never;
  const rows = [
    obj("Salesforce", "application", { vendor: "Salesforce" }),
    obj("Order Entry", "application", { cost_model: "built_ourselves" }),
    obj("BarTender", "application", { vendor: "Seagull" }),
    obj("AS400", "model", { vendor: "IBM" }),
  ].map(rowFromObject).filter(Boolean) as never[];
  assert.equal(catalogStats(rows).vendorCount, 3);
});

test("Ask header never shows zero counts while the catalogue loads; setup refetches on finish", () => {
  const ask = readFileSync(new URL("../../components/mvp/AskScreen.tsx", import.meta.url), "utf8");
  assert.match(ask, /!catalog\.data \? <span data-testid="ask-header-loading">/);
  const setup = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  const open = setup.slice(setup.indexOf("const openReadyMap"), setup.indexOf("router.push", setup.indexOf("const openReadyMap")));
  assert.match(open, /invalidateQueries\(\{ queryKey: catalogQueryKey/);
});
