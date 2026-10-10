/**
 * Browser side of POST /ai/ask/stream (Server-Sent Events over a fetch POST).
 *
 * Frames: meta, step (live working), delta (chunks of text that already passed the server's check),
 * final (the same payload as POST /ai/ask), error, done. Comment lines are pings.
 * Any broken stream (bad status, no body, error frame, or ending without a final) falls back to the
 * JSON endpoint exactly once.
 */
import type { AskModelPayload, AskStep } from "@/lib/api-client";

export type SseEvent = { event: string; data: string };

/** Incremental SSE parser: handles frames split across chunks, \r\n line ends, comments, multi-line data. */
export class SseParser {
  private buffer = "";

  feed(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const out: SseEvent[] = [];
    // Normalise line ends; keep a trailing lone \r in the buffer in case \n follows in the next chunk.
    let text = this.buffer.replace(/\r\n/g, "\n");
    const keepCr = text.endsWith("\r");
    if (keepCr) text = text.slice(0, -1);
    text = text.replace(/\r/g, "\n");
    let end: number;
    while ((end = text.indexOf("\n\n")) !== -1) {
      const block = text.slice(0, end);
      text = text.slice(end + 2);
      const parsed = parseBlock(block);
      if (parsed) out.push(parsed);
    }
    this.buffer = keepCr ? `${text}\r` : text;
    return out;
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (!data.length && event === "message") return null;
  return { event, data: data.join("\n") };
}

export type StreamHandlers = {
  onStep?: (step: AskStep) => void;
  /** Called with the checked text so far, growing chunk by chunk. */
  onText?: (text: string) => void;
};

export class AskStreamError extends Error {}

/** Read a stream response to its final payload. Throws AskStreamError on any broken stream. */
export async function readAskStream(response: Response, handlers: StreamHandlers = {}): Promise<AskModelPayload> {
  if (!response.ok) throw new AskStreamError(`stream status ${response.status}`);
  if (!response.body) throw new AskStreamError("no stream body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let final: AskModelPayload | null = null;
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    const events = parser.feed(done ? decoder.decode() : decoder.decode(value, { stream: true }));
    for (const item of events) {
      if (item.event === "error") throw new AskStreamError("stream error frame");
      if (item.event === "done") {
        if (!final) throw new AskStreamError("stream ended without a final answer");
        return final;
      }
      let data: unknown;
      try {
        data = JSON.parse(item.data);
      } catch {
        continue;
      }
      if (item.event === "step") handlers.onStep?.(data as AskStep);
      else if (item.event === "delta") {
        text += String((data as { text?: string }).text ?? "");
        handlers.onText?.(text);
      } else if (item.event === "final") final = data as AskModelPayload;
    }
    if (done) break;
  }
  if (final) return final; // final arrived but the connection closed before "done": still a full answer
  throw new AskStreamError("stream truncated");
}

export type AskStreamOptions = StreamHandlers & {
  url: string;
  token: string;
  question: string;
  /** POST /ai/ask, used once if the stream breaks. */
  fallback: () => Promise<AskModelPayload>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export async function askWithStream(options: AskStreamOptions): Promise<AskModelPayload> {
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(options.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${options.token}` },
      body: JSON.stringify({ question: options.question }),
      signal: options.signal,
    });
    return await readAskStream(response, options);
  } catch (err) {
    if (options.signal?.aborted) throw err;
    return options.fallback();
  }
}
