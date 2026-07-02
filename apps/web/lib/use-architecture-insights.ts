"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi } from "@/lib/api-client";
import { dedupeInsights } from "@/lib/workspace-dashboard";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";

export function insightsQueryKey(orgSlug: string, workspaceSlug: string) {
  return ["ai-insights", orgSlug, workspaceSlug] as const;
}

const STALE_MS = 24 * 60 * 60 * 1000;
/** Initial attempt + up to 3 retries per workspace session. */
const MAX_AUTO_RETRIES = 3;
const RETRY_BASE_MS = 3000;

function isFreshAnalysedAt(analysedAt: string | null | undefined): boolean {
  if (!analysedAt) return false;
  const ts = Date.parse(analysedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < STALE_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AutoGenerateState = {
  retries: number;
  done: boolean;
  running: boolean;
};

/**
 * Architecture insights — analysed on workspace login and manual refresh only.
 */
export function useArchitectureInsights(orgSlug: string, workspaceSlug: string) {
  const { getToken } = useAuth();
  const enabled = useAuthQueryEnabled(orgSlug, workspaceSlug);
  const queryClient = useQueryClient();
  const autoGenerateState = useRef<Map<string, AutoGenerateState>>(new Map());

  const queryKey = insightsQueryKey(orgSlug, workspaceSlug);

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const token = await getToken();
      return aiApi.listInsights(orgSlug, workspaceSlug, token!);
    },
    enabled,
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      await aiApi.generateInsights(orgSlug, workspaceSlug, token!);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  // Auto-generate when insights are missing or stale — max 3 retries, then stop.
  useEffect(() => {
    if (!enabled || !orgSlug || !workspaceSlug || isLoading) return;

    const sessionKey = `${orgSlug}/${workspaceSlug}`;
    const state = autoGenerateState.current.get(sessionKey) ?? {
      retries: 0,
      done: false,
      running: false,
    };

    if (state.done || state.running || state.retries > MAX_AUTO_RETRIES) {
      autoGenerateState.current.set(sessionKey, state);
      return;
    }

    const hasFreshInsights =
      (data?.count ?? 0) > 0 && isFreshAnalysedAt(data?.analysed_at ?? null);
    if (hasFreshInsights) {
      autoGenerateState.current.set(sessionKey, { ...state, done: true });
      return;
    }

    autoGenerateState.current.set(sessionKey, { ...state, running: true });

    void (async () => {
      let current = autoGenerateState.current.get(sessionKey)!;

      while (current.retries <= MAX_AUTO_RETRIES) {
        try {
          const token = await getToken();
          await aiApi.generateInsights(orgSlug, workspaceSlug, token!);
          await queryClient.invalidateQueries({ queryKey });
          autoGenerateState.current.set(sessionKey, {
            retries: current.retries,
            done: true,
            running: false,
          });
          return;
        } catch {
          current = autoGenerateState.current.get(sessionKey) ?? current;
          current.retries += 1;

          if (current.retries > MAX_AUTO_RETRIES) {
            autoGenerateState.current.set(sessionKey, {
              retries: current.retries,
              done: true,
              running: false,
            });
            return;
          }

          autoGenerateState.current.set(sessionKey, { ...current, running: true });
          await sleep(RETRY_BASE_MS * current.retries);
          current = autoGenerateState.current.get(sessionKey) ?? current;
        }
      }

      autoGenerateState.current.set(sessionKey, {
        retries: current.retries,
        done: true,
        running: false,
      });
    })();
  }, [enabled, orgSlug, workspaceSlug, isLoading, data?.count, data?.analysed_at, getToken, queryClient, queryKey]);

  const insights = useMemo(() => dedupeInsights(data?.insights ?? []), [data?.insights]);

  const badgeCount = useMemo(
    () => insights.filter((i) => i.severity === "high" || i.severity === "medium").length,
    [insights]
  );

  const criticalOnly = useMemo(() => insights.some((i) => i.severity === "high"), [insights]);

  return {
    insights,
    count: data?.count ?? insights.length,
    analysedAt: data?.analysed_at ?? null,
    isLoading: isLoading || isFetching,
    isGenerating: generateMutation.isPending,
    badgeCount,
    criticalOnly,
    refresh: () => generateMutation.mutate(),
  };
}
