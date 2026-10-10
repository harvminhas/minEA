/**
 * Word-by-word reveal of a checked answer in the answer card itself. Revealing here (not only in the
 * live stream area) means the person sees the text arrive whatever the network did to the chunks:
 * a tunnel or proxy can hand every delta and the final over in one read.
 */
export const REVEAL_MS = 28;

export function revealTokens(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** The first n words, with an unclosed **bold** closed so it never shows raw asterisks. */
export function revealText(text: string, n: number): string {
  const tokens = revealTokens(text);
  if (n >= tokens.length) return text;
  let out = tokens.slice(0, Math.max(0, n)).join("");
  if ((out.match(/\*\*/g) ?? []).length % 2 === 1) out = `${out.trimEnd()}**`;
  return out;
}

/**
 * Which result may render: only the one for the question on screen now. A late result for an earlier
 * question (a slow stream, a fallback finishing after the person moved on) is dropped.
 */
export function latestOnly<T extends { question: string }>(result: T | null | undefined, question: string): T | null {
  return result && result.question === question ? result : null;
}
