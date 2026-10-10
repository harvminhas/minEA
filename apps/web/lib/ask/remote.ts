/**
 * The model query for one question. Its result is tagged with the question, and the stream gets
 * react-query's AbortSignal, so moving to another question aborts the old stream and a late
 * result for an earlier question can never be shown (see latestOnly).
 */
import type { AskModelPayload } from "@/lib/api-client";

export type AskRemoteResult = { question: string; payload: AskModelPayload };

export function askQueryKey(orgSlug: string, workspaceSlug: string, question: string) {
  return ["ask-model", orgSlug, workspaceSlug, question] as const;
}

export function askQueryFn(question: string, run: (question: string, signal: AbortSignal) => Promise<AskModelPayload>) {
  return async ({ signal }: { signal: AbortSignal }): Promise<AskRemoteResult> => ({ question, payload: await run(question, signal) });
}
