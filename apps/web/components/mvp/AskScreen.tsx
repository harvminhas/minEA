"use client";

import React, { Fragment, useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { addApi, aiApi, objectsApi, peopleDirectoryApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { askPath, modelItemPath, modelPath, reportPath } from "@/lib/mvp-paths";
import { ASK_BAR_ID } from "@/components/nav/ask-shortcut";
import { catalogStats, moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import { askChips, popularCards, supportCounts } from "@/lib/reports/home";
import { useAppStore } from "@/lib/store";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { answerFromModel, nameMatchAnswer, recordsAnswer, type AskAnswer, type AskCitation, type AskFixAction } from "@/lib/ask/deterministic";
import { buildFacts, type RecordFilters } from "@/lib/ask/record-filter";
import { AskRecordsBlock, FollowPill } from "@/components/mvp/AskRecords";
import { AskBuilding, AskOwl } from "@/components/mvp/AskBuilding";
import { adminTabHref } from "@/lib/billing/admin-centre";
import { splitSummary } from "@/lib/ask/rich";
import { REVEAL_MS, latestOnly, revealText, revealTokens } from "@/lib/ask/reveal";
import { askQueryFn, askQueryKey } from "@/lib/ask/remote";
import { addTurn, clearThread, contextFor, earlierTurns, readThread, turnFromAnswer, writeThread, type Thread, type ThreadTurn } from "@/lib/ask/thread";
import { AskBarChart, AskRichTable } from "@/components/mvp/AskRich";
import { pickAnswer, shouldAskModel, workingLine } from "@/lib/ask/route";
import { followUpScope } from "@/lib/ask/followup";
import { AskLiveSteps, AskSteps, AskTimingBlock } from "@/components/mvp/AskSteps";
import type { AskTimingDetails } from "@/lib/ask/deterministic";
import type { AskStep } from "@/lib/api-client";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { AddSaved } from "@/components/add/AddCards";
import { AppAddPanel } from "@/components/add/AppAddPanel";
import { FirstRunAsk, SetupCard } from "@/components/mvp/FirstRunAsk";
import { addAnywhereEnabled, askStreamEnabled } from "@/lib/flags";
import { addListText, classifyAddIntent, prefixAdd } from "@/lib/setup/add-intent";
import { undoneSentence, readAddReceipt, writeAddReceipt, type AddReceipt } from "@/lib/setup/add-cards";
import { normalizeTerm, TOOL_CATALOG } from "@/lib/setup/match-tools";
import { Pill } from "@/components/mvp/pills";
import { countLabel } from "@/lib/labels";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { aiLandscape } from "@/lib/ai/landscape";
import { aiHomeCard, type AiHomeCard } from "@/lib/ai/home-card";
import { relationshipVerb } from "@/lib/relationship-display";
import type { ImpactEdge, ImpactNode } from "@/lib/impact/relationship-impact";
import type { RelationshipType } from "@minea/types";

export function AskScreen({ mode }: { mode: "home" | "answer" }) {
  const params = useSearchParams();
  const urlQuestion = (mode === "answer" ? params.get("q") ?? "" : "").trim();
  const initial = urlQuestion;
  const [draft, setDraft] = useState(initial);
  const [note, setNote] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const catalog = useModelCatalog();
  const rows = catalog.data?.rows ?? [];
  const stats = catalogStats(rows);
  // The question on screen is owned here, not read live from the URL. A new question sets it at once
  // and the URL follows (history.pushState, no server round trip). A URL that still reports the
  // previous q while that navigation settles is ignored, so it can never flip the page back to the
  // first question's answer. Back/forward (a URL change we did not make) still switches question.
  const [asked, setAsked] = useState(urlQuestion);
  const pendingUrl = useRef<string | null>(null);
  useEffect(() => {
    if (pendingUrl.current !== null) {
      if (urlQuestion === pendingUrl.current) pendingUrl.current = null;
      return;
    }
    setAsked(urlQuestion);
  }, [urlQuestion]);
  const question = mode === "answer" ? asked : "";
  const focusId = mode === "answer" ? params.get("focus") ?? undefined : undefined;

  const impact = useImpactGraph();
  const anywhere = addAnywhereEnabled();
  const [readAs, setReadAs] = useState<"auto" | "add" | "ask">("auto");
  const knownNames = useMemo(() => {
    const names = new Set<string>();
    for (const tool of TOOL_CATALOG) {
      if (tool.kind === "platform") continue;
      names.add(normalizeTerm(tool.name));
      for (const alias of tool.aliases) names.add(normalizeTerm(alias));
    }
    for (const object of catalog.data?.objects ?? []) names.add(normalizeTerm(object.name));
    return names;
  }, [catalog.data?.objects]);
  const addDecision = anywhere && question ? classifyAddIntent(question, (term) => knownNames.has(normalizeTerm(term))) : "question";
  const showingAdd = anywhere && mode === "answer" && (readAs === "add" || (readAs === "auto" && addDecision === "add"));
  const ambiguous = anywhere && mode === "answer" && readAs === "auto" && addDecision === "ambiguous";
  const [addReceipt, setAddReceipt] = useState<AddReceipt | null>(null);
  const visibleReceipt = addReceipt && addReceipt.question === question ? addReceipt : null;
  useEffect(() => {
    setReadAs("auto");
  }, [question]);
  useEffect(() => {
    const stored = readAddReceipt(orgSlug, workspaceSlug, question);
    setAddReceipt((current) => (current?.question === question ? current : stored));
  }, [orgSlug, workspaceSlug, question]);

  const rememberAdd = (receipt: AddReceipt) => {
    const stored = { ...receipt, question };
    writeAddReceipt(orgSlug, workspaceSlug, stored);
    setAddReceipt(stored);
  };

  const undoAdd = async () => {
    if (!addReceipt || !orgSlug || !workspaceSlug) return;
    const token = await getToken();
    if (!token || Date.now() > addReceipt.undoUntil) return;
    await addApi.undo(orgSlug, workspaceSlug, { object_ids: addReceipt.objectIds, relationship_ids: addReceipt.relationshipIds }, token);
    for (const id of addReceipt.objectIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeId: id });
    for (const id of addReceipt.relationshipIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
    const undone: AddReceipt = {
      ...addReceipt,
      added: undoneSentence(addReceipt.names ?? []),
      kept: "",
      todos: [],
      canUndo: false,
      objectIds: [],
      relationshipIds: [],
    };
    writeAddReceipt(orgSlug, workspaceSlug, undone);
    setAddReceipt(undone);
  };

  // The conversation in this tab (step 4). A ref feeds the query so the thread changing never re-keys it.
  const [thread, setThread] = useState<Thread>({ turns: [] });
  const threadRef = useRef<Thread>(thread);
  threadRef.current = thread;
  useEffect(() => {
    if (orgSlug && workspaceSlug) setThread(readThread(window.sessionStorage, orgSlug, workspaceSlug));
  }, [orgSlug, workspaceSlug]);
  // The People list feeds name matching (hints for the fallback list). A viewer without access
  // just gets owner names from items.
  const directory = useQuery({
    queryKey: ["people-directory", orgSlug, workspaceSlug],
    enabled: mode === "answer" && Boolean(orgSlug && workspaceSlug),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => peopleDirectoryApi.get(orgSlug!, workspaceSlug!, (await getToken())!),
  });
  const people = useMemo(() => (directory.data?.people ?? []).map((person) => person.name), [directory.data]);
  const facts = useMemo(
    () => buildFacts(rows, catalog.data?.objects ?? [], catalog.data?.relationships ?? []),
    [rows, catalog.data?.objects, catalog.data?.relationships]
  );
  // Shown only when the AI can't answer: items whose name, vendor or owner match words in the question.
  const local = useMemo(() => nameMatchAnswer(question, facts, people), [question, facts, people]);

  // Decide local-or-model BEFORE calling: questions the browser always answers itself never
  // reach Gemini (they used to be asked and the answer thrown away).
  const catalogSettled = catalog.isSuccess || catalog.isError;
  const askModel = shouldAskModel({
    mode,
    question,
    showingAdd,
    ambiguous,
    hasWorkspace: Boolean(orgSlug && workspaceSlug),
    catalogSettled,
    local,
    estateEmpty: catalog.isSuccess && rows.length === 0,
  });
  // Live working for the question being streamed (flag ask.stream.v1). Keyed by question so a
  // late event from an earlier question never shows under a new one.
  const [live, setLive] = useState<{ question: string; steps: AskStep[]; text: string; headline?: string }>({ question: "", steps: [], text: "" });
  const remote = useQuery({
    queryKey: askQueryKey(orgSlug, workspaceSlug, question),
    enabled: askModel,
    retry: false,
    // signal: react-query aborts it when the question changes, so an old stream is closed, not left to
    // finish late. The result is tagged with its question and only rendered for that question.
    queryFn: askQueryFn(question, async (asked, signal) => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      const context = contextFor(threadRef.current, asked);
      if (!askStreamEnabled()) return aiApi.ask(orgSlug, workspaceSlug, asked, token, context);
      setLive({ question: asked, steps: [], text: "" });
      return aiApi.askStream(orgSlug, workspaceSlug, asked, token, {
        signal,
        context,
        onStep: (step) => setLive((cur) => (cur.question === asked ? { ...cur, steps: [...cur.steps, step] } : cur)),
        onHeadline: (text) => setLive((cur) => (cur.question === asked ? { ...cur, headline: text } : cur)),
      });
    }),
  });
  const remoteData = latestOnly(remote.data, question)?.payload;
  const [buildStatus, setBuildStatus] = useState("Working it out…");
  // A just-arrived AI answer animates in (headline word by word, rows filling in); a cached one doesn't.
  const freshAt = useMemo(() => (remote.dataUpdatedAt && Date.now() - remote.dataUpdatedAt < 3000 ? remote.dataUpdatedAt : 0), [remote.dataUpdatedAt]);
  const liveNow: { steps: AskStep[]; text: string; headline?: string } = live.question === question ? live : { steps: [], text: "" };


  // A disabled query stays "pending" in react-query v5, so only a model we actually asked counts.
  const thinking =
    mode === "answer" && question.length > 0 && !showingAdd && !ambiguous && (!catalogSettled || (askModel && remote.isPending));
  useEffect(() => {
    setDraft(question);
  }, [question]);

  const baseAnswer = useMemo(() => {
    if (mode !== "answer" || !question) return local;
    const fromModel = askModel && remoteData ? answerFromModel(remoteData, rows, basePath, question) : null;
    // The request itself failed (network, proxy timeout, 5xx): say so in the steps with a reason code.
    const failed: AskStep[] | undefined = askModel && remote.isError
      ? [{ id: "ai-reason", status: "error", label: `AI request failed before an answer came back: ${requestError(remote.error)} [reason: request_failed]` }]
      : undefined;
    return pickAnswer(local, fromModel, question, askModel ? remoteData?.steps ?? failed : undefined);
  }, [mode, question, askModel, remoteData, local, rows, basePath, remote.isError, remote.error]);
  const [edited, setEdited] = useState<{ question: string; filters: RecordFilters } | null>(null);
  const answer = useMemo(() => {
    // Chip edits and suggestion pills are structured filters run here on the catalogue: no AI, no quota.
    if (!edited || edited.question !== question) return baseAnswer;
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return recordsAnswer({ ...(baseAnswer.records ?? { terms: [], source: "quick" as const }), filters: edited.filters, headline: undefined, ids: undefined, items: undefined }, facts, today);
  }, [baseAnswer, edited, question, facts]);
  // Why the AI's answer isn't shown, when it isn't: unavailable (no key / error / timeout) or the
  // organisation's monthly allowance is used up. Quick answers keep working in both cases.
  const fallbackReason = askModel ? (remoteData?.source === "fallback" ? remoteData.fallback_reason : remote.isError ? "request_failed" : null) : null;
  // Every reason the AI's answer wasn't used gets its own line; none falls back to a bare generic sentence.
  const aiNote = answer.handler === "unsupported" ? aiFallbackNote(fallbackReason, false) : null;
  const aiUnavailable = Boolean(aiNote?.blocked);
  const quotaHit = fallbackReason === "limit" ? remoteData?.quota ?? null : null;

  // Reveal a freshly streamed answer word by word in the card (cached answers show at once).
  const [revealed, setRevealed] = useState<{ question: string; at: number; n: number } | null>(null);
  useEffect(() => {
    if (!askStreamEnabled() || !remoteData || !remote.dataUpdatedAt) return;
    if (Date.now() - remote.dataUpdatedAt > 3000) return;
    const total = revealTokens(answer.answerText).length;
    let n = 0;
    setRevealed({ question, at: remote.dataUpdatedAt, n: 0 });
    const timer = window.setInterval(() => {
      n += 1;
      setRevealed({ question, at: remote.dataUpdatedAt, n });
      if (n >= total) window.clearInterval(timer);
    }, REVEAL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.dataUpdatedAt, question]);
  const revealing = revealed && revealed.question === question && revealed.at === remote.dataUpdatedAt && revealed.n < revealTokens(answer.answerText).length;
  const shownText = revealing ? revealText(answer.answerText, revealed!.n) : answer.answerText;

  // Keep each settled answer as a turn of the conversation (this tab only).
  useEffect(() => {
    if (mode !== "answer" || !question || thinking || revealing || showingAdd || ambiguous || !orgSlug || !workspaceSlug) return;
    if (answer.handler === "clarify" || answer.loading) return;
    setThread((current) => {
      const next = addTurn(current, turnFromAnswer(question, answer));
      if (next !== current) writeThread(window.sessionStorage, orgSlug, workspaceSlug, next);
      return next;
    });
  }, [mode, question, thinking, revealing, showingAdd, ambiguous, answer, orgSlug, workspaceSlug]);
  const earlier = mode === "answer" ? earlierTurns(thread, question) : [];
  const newConversation = () => {
    setThread(clearThread(window.sessionStorage, orgSlug, workspaceSlug));
    router.push(askPath(basePath));
  };

  const orgName = useAppStore((state) => state.activeOrg?.name) || "Your estate";
  const setup = useWorkspaceSetup();
  const [setupOpen, setSetupOpen] = useState(false);
  // Dev only: ?setup=preview opens the first-run flow on a workspace that is already set up (QA), without touching its setup state.
  const setupPreview = process.env.NODE_ENV !== "production" && params.get("setup") === "preview";
  const showSetup = setup.enabled && setup.ready && (setupPreview || (!setup.state.met && (!setup.dismissed || setupOpen)));
  const [setupLatched, setSetupLatched] = useState(false);
  useEffect(() => {
    if (showSetup) setSetupLatched(true);
    else if (setup.dismissed && !setupOpen) setSetupLatched(false);
  }, [showSetup, setup.dismissed, setupOpen]);
  const keepSetup = showSetup || setupLatched;
  const emptyPreview = process.env.NODE_ENV !== "production" && params.get("demo") === "empty";
  // Until the catalogue arrives, the report cards would read as false empty states ("No costs tracked").
  const estateLoading = !catalog.data;
  const chips = askChips(rows, impact.edges, new Date(), catalog.data?.objects ?? []);
  const cards = popularCards(rows, impact.edges, new Date(), emptyPreview);
  const support = supportCounts(rows);
  const platformCount = rows.filter((row) => row.kind === "platform").length;
  const serverCount = rows.filter((row) => row.kind === "runtime").length;
  const aiCard = useMemo(
    () => (mode === "home" && catalog.data ? aiHomeCard(aiLandscape({ objects: catalog.data.objects, relationships: catalog.data.relationships })) : null),
    [mode, catalog.data]
  );

  // Home → answer is a route change (in dev it can compile for seconds). Show the working state the
  // moment Ask is pressed instead of leaving the home page up with no feedback.
  const [pendingQuestion, setPendingQuestion] = useState("");
  useEffect(() => {
    if (mode === "home" && basePath) router.prefetch(askPath(basePath, "prefetch"));
  }, [mode, basePath, router]);
  const submit = (value: string, nextFocusId?: string) => {
    const q = value.trim();
    if (!q) return;
    setDraft(q);
    if (mode === "home") setPendingQuestion(q);
    // Same question again: the URL wouldn't change, so router.push would do nothing visible. Re-run it.
    if (mode === "answer" && q === question && !nextFocusId) {
      if (askModel) void remote.refetch();
      return;
    }
    if (mode === "answer") {
      pendingUrl.current = q;
      setAsked(q);
      window.history.pushState(null, "", askPath(basePath, q, nextFocusId));
      return;
    }
    router.push(askPath(basePath, q, nextFocusId));
  };

  const beginAdd = () => {
    const next = prefixAdd(draft);
    setDraft(next);
    if (addListText(next)) submit(next);
    else document.getElementById(ASK_BAR_ID)?.focus();
  };

  if (mode === "home" && (showSetup || setupLatched)) {
    return (
      <div className="mx-auto max-w-3xl px-6 pb-16 pt-12">
        <FirstRunAsk />
      </div>
    );
  }

  if (mode === "home" && pendingQuestion) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-6" data-testid="ask-pending">
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-[#e6e8ee] px-3 py-2">
          <Sparkles size={16} className="text-[#5b4ce6]" />
          <span className="h-10 flex-1 truncate py-2 text-[15px] text-[#1c2230]">{pendingQuestion}</span>
        </div>
        <section className="overflow-hidden rounded-2xl border border-[#e4e0ff] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#efeaff] bg-[#f7f6ff] px-5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#5b4ce6]">
              <Sparkles size={12} /> ANSWER
            </p>
            <span className="max-w-[70%] truncate text-[12px] font-medium text-[#5b4ce6]">Working on “{pendingQuestion}”</span>
          </div>
          <div className="px-5 py-6">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#ece9ff]">
              <div className="diagram-saving-bar-indeterminate h-full w-2/5 rounded-full bg-[#5b4ce6]" />
            </div>
            <p data-testid="ask-working" className="mt-4 text-[15px] font-medium text-[#1c2230]">
              {catalogSettled ? workingLine(rows.length) : "Loading your estate"}
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (mode === "home") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-16 pt-16">
        <p className="rounded-full bg-[#f4f3ff] px-3 py-1 text-[12px] text-[#5b4ce6]">Answers come from your own records, with sources</p>
        <h1 className="mt-6 text-center text-[36px] font-semibold tracking-tight text-[#1c2230]">What do you want to know?</h1>
        {!keepSetup && (
          <p className="mt-2 max-w-full text-center text-[14px] text-[#6b7289]">
            {/* Never show zero counts for an estate that just hasn't loaded yet. */}
            {!catalog.data ? <span data-testid="ask-header-loading">{orgName} · Loading your estate…</span> : <>
            {orgName} · {countLabel(stats.systems, "application", "applications")} · {countLabel(platformCount, "platform", "platforms")} · {countLabel(serverCount, "server or device", "servers & devices")} · {countLabel(stats.vendorCount, "vendor", "vendors")} · {moneyLabel(stats.spend || 0)} a year in tracked spend
            {support.out > 0 && (
              <>
                {" "}
                <Link href={`${modelPath(basePath, "servers")}?status=out_of_support_or_os`} className="whitespace-nowrap font-medium text-[#c2410c]">
                  · {support.out} out of support
                </Link>
              </>
            )}
            </>}
          </p>
        )}
        <form
          className="mt-6 flex w-full items-center gap-2 rounded-2xl border border-[#e6e8ee] bg-white px-3 py-2 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <Sparkles size={16} className="ml-1 text-[#5b4ce6]" />
          <input
            id={ASK_BAR_ID}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything about your systems, vendors, costs, or risks"
            className="h-11 flex-1 bg-transparent text-[15px] outline-none"
          />
          {anywhere && (
            <button type="button" className="rounded-lg px-2 py-1 text-[13px] font-semibold text-[#5b4ce6]" onClick={beginAdd}>
              + Add
            </button>
          )}
          <button type="submit" className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white">
            Ask →
          </button>
        </form>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {chips.map((chip, index) => (
            <button
              key={`${index}-${chip}`}
              type="button"
              onClick={() => submit(chip)}
              className="rounded-full border border-[#e6e8ee] bg-white px-3 py-1.5 text-[13px] text-[#3c4254] hover:border-[#c9c6f5]"
            >
              {chip}
            </button>
          ))}
        </div>
        {keepSetup && <FirstRunAsk />}
        {setup.enabled && setup.ready && !setup.state.met && setup.dismissed && !setupOpen && (
          <SetupCard onOpen={() => { setSetupOpen(true); void setup.save({ clearDismissed: true }); }} />
        )}
        {!keepSetup && <div className="mt-12 w-full">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#1c2230]">Popular reports</h2>
            <Link href={`${basePath}/reports`} className="text-[13px] text-[#5b4ce6]">All reports →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ReportTile href={cards.renewals.detail === "Add" ? modelPath(basePath, "applications") : reportPath(basePath, "renewals")} title="Renewals next 90 days" value={estateLoading ? "…" : cards.renewals.value} detail={estateLoading ? "Loading…" : cards.renewals.detail} />
            <ReportTile href={cards.spend.detail === "Add" ? modelPath(basePath, "applications") : reportPath(basePath, "spend")} title="Spend by vendor & category" value={estateLoading ? "…" : cards.spend.value} detail={estateLoading ? "Loading…" : cards.spend.detail} />
            <ReportTile href={reportPath(basePath, "ownership-gaps")} title="Ownership gaps" value={estateLoading ? "…" : cards.ownership.value} detail={estateLoading ? "Loading…" : cards.ownership.detail} />
            <ReportTile href={`${modelPath(basePath, "servers")}?status=attention`} title="Aging infrastructure" value={estateLoading ? "…" : cards.aging.value} detail={estateLoading ? "Loading…" : cards.aging.detail} alert={!estateLoading && cards.aging.alert} />
          </div>
          {aiCard && <AiCard card={aiCard} href={reportPath(basePath, "ai-landscape")} />}
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#e6e8ee] bg-[#fafafb] px-4 py-3">
            <div>
              <div className="text-[14px] font-medium text-[#1c2230]">{estateLoading ? "Model health: loading…" : `Model health: ${stats.completeness}% complete, ${stats.missing} fields missing`}</div>
              <p className="text-[12px] text-[#6b7289]">Answers get better as you fill gaps.</p>
            </div>
            <Link href={modelPath(basePath, "applications")} className="rounded-lg bg-[#fff4d6] px-3 py-1.5 text-[13px] font-medium text-[#92400e]">
              Fill missing →
            </Link>
          </div>
          {params.get("dev") === "1" && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[#8b90a0]">
              <span>Prototype preview</span>
              <Link href={askPath(basePath)} className={`rounded-full px-2 py-0.5 ${emptyPreview ? "" : "bg-[#ece9ff] text-[#3f35b5]"}`}>Your data</Link>
              <Link href={`${askPath(basePath)}?demo=empty`} className={`rounded-full px-2 py-0.5 ${emptyPreview ? "bg-[#ece9ff] text-[#3f35b5]" : ""}`}>Empty states</Link>
            </div>
          )}
        </div>}
      </div>
    );
  }

  // Lean card: a filtered list (quick or AI) or a short "No". Headline + chips + table + footer, no prose.
  // The AI couldn't be used (error, timeout, not set up, monthly limit): the same lean card, its
  // headline says why, one grey line says what still works, the steps carry the reason code.
  const fallbackLean: AskAnswer["lean"] | null =
    !answer.lean && !answer.records && answer.handler === "unsupported" && (aiNote || quotaHit)
      ? {
          headline: quotaHit ? "This month's AI questions are used up" : aiNote!.title.replace(/\.$/, ""),
          sub: fallbackSub(answer.nameMatches),
          noAdd: true,
        }
      : null;
  const fallbackItems = fallbackLean ? answer.citations.map((item) => item.row) : [];
  const shownLean = answer.lean ?? fallbackLean;
  // The AI's bullets/context. With the item card they fold under "Show summary" below the summary line.
  const proseBlock = (answer.evidence?.length || answer.context) ? (
    <>
              {answer.evidence && answer.evidence.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-[#3c4254]">
                    {answer.evidence.map((item, index) => (
                    <li key={`${index}-${item.text}`}>
                      <LinkedNames text={item.text} nodes={impact.nodes} onOpen={setPreviewId} />
                    </li>
                  ))}
                </ul>
              )}
              {answer.context && <p className="mt-2 text-[13px] text-[#6b7289]">{answer.context}</p>}
    </>
  ) : null;
  const leanCard = !thinking && answer.handler !== "clarify" && Boolean(answer.records || shownLean);
  const smallActions = (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#f3f4f8] pt-2.5 text-[12px] text-[#8b90a0]" data-testid="ask-small-actions">
      <button type="button" className="hover:text-[#5b4ce6]" onClick={() => { saveAsk(question, answer.answerText); setNote("Saved to Reports › Saved from Ask"); }}>Save as report</button>
      <button type="button" className="hover:text-[#5b4ce6]" onClick={() => { downloadCsv(answer); setNote("Exported the answer and its sources to CSV"); }}>Export</button>
      <button type="button" className="hover:text-[#5b4ce6]" onClick={() => { navigator.clipboard.writeText(window.location.href); setNote("Share link copied"); }}>Share</button>
      <span className="ml-auto">Was this right?</span>
      <button type="button" className="hover:text-[#5b4ce6]" onClick={() => setNote("Thanks for the feedback")}>Yes</button>
      <button type="button" className="hover:text-[#5b4ce6]" onClick={() => setNote("Thanks. Tell us what was wrong.")}>No</button>
    </div>
  );

  return (
    <div
      className="mx-auto max-w-4xl px-6 py-6"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || visibleReceipt || !showingAdd) return;
        event.preventDefault();
        setReadAs("ask");
      }}
    >
      <form
        className="mb-6 flex items-center gap-2 rounded-2xl border border-[#e6e8ee] px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <Sparkles size={16} className="text-[#5b4ce6]" />
        <input id={ASK_BAR_ID} value={draft} onChange={(event) => setDraft(event.target.value)} className="h-10 flex-1 bg-transparent text-[15px] outline-none" />
        {anywhere && (
          <button type="button" className="rounded-lg px-2 py-1 text-[13px] font-semibold text-[#5b4ce6]" onClick={beginAdd}>
            + Add
          </button>
        )}
        <button type="submit" className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white">Ask →</button>
      </form>
      {earlier.length > 0 && (
        <ConversationThread turns={earlier} hrefFor={(id) => {
          const row = rows.find((item) => item.id === id);
          return row ? recordHref(basePath, row) : null;
        }} onAsk={submit} onNew={newConversation} />
      )}
      {visibleReceipt ? (
        <AddSaved added={visibleReceipt.added} kept={visibleReceipt.kept} todos={visibleReceipt.todos} canUndo={visibleReceipt.canUndo && Date.now() < visibleReceipt.undoUntil} motion={false} onUndo={() => void undoAdd()} />
      ) : showingAdd ? (
        // Same component as Model > Applications; the names from the question prefill the box.
        <AppAddPanel origin="ask" boxId="ask-add-box" initialText={addListText(question)} onSaved={rememberAdd} onClose={() => setReadAs("ask")} />
      ) : ambiguous ? (
        <div className="rounded-2xl border border-[#e6e8ee] bg-white px-5 py-4">
          <p className="text-[15px] text-[#1c2230]">Is this a list of things to add, or a question?</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white" onClick={() => setReadAs("add")}>Add these as apps</button>
            <button type="button" className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]" onClick={() => setReadAs("ask")}>Ask about them</button>
          </div>
        </div>
      ) : (
      <section className="overflow-hidden rounded-2xl border border-[#e4e0ff] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#efeaff] bg-[#f7f6ff] px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#5b4ce6]">
            <AskOwl size={16} /> ANSWER
          </p>
          {thinking && <span data-testid="ask-status" className="max-w-[70%] truncate text-[12px] font-medium text-[#8a80e0]">{buildStatus}</span>}
        </div>
        {thinking ? (
          <AskBuilding steps={liveNow.steps} headline={liveNow.headline} streaming={askModel && askStreamEnabled()} estateCount={catalogSettled ? rows.length : null} onStatus={setBuildStatus} />
        ) : (
          <div className="px-5 py-5">
            {quotaHit && !fallbackLean && (
              <p data-testid="ask-limit" className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-[#6b7289]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f59e0b]" />
                Your organisation has used its {quotaHit.limit.toLocaleString("en-US")} AI questions for this month. Quick answers (vendors, owners, renewals, spend, impact) still work.
                {quotaHit.plan === "free" && orgSlug && (
                  <Link href={adminTabHref(orgSlug, "billing")} className="font-medium text-[#5b4ce6]">Upgrade to Starter →</Link>
                )}
              </p>
            )}
            {aiNote && !fallbackLean && (
              <div data-testid={aiNote.blocked ? "ask-ai-unavailable" : "ask-ai-note"} data-reason={fallbackReason ?? "unsupported"} className="mb-3 rounded-xl border border-[#e6e8ee] bg-[#f3f4f8] px-4 py-3 text-[13px] text-[#3c4254]">
                <b>{aiNote.title}</b> {aiNote.body}
              </div>
            )}
            {shownLean && !answer.records && (
              <LeanAnswer lean={shownLean} basePath={basePath} footerExtra={smallActions} onAdd={(name) => submit(prefixAdd(name))} onPick={(filters) => setEdited({ question, filters })} items={fallbackItems} rowHref={(row) => recordHref(basePath, row)} steps={answer.steps} timing={answer.timingLine} timingDetails={answer.timingDetails} />
            )}
            {!leanCard && <p className="text-[17px] leading-7 text-[#1c2230]">
              {answer.handler === "clarify" ? (
                <ClarifyChoices
                  citations={answer.citations}
                  followUps={answer.followUps}
                  onChoose={submit}
                />
              ) : (
                <span data-testid="ask-answer-text" data-revealing={revealing ? "1" : "0"}>
                  {answer.scopeNote && (
                    <span data-testid="ask-scope-note" className="mb-2 block text-[12px] font-medium text-[#5b4ce6]">
                      {answer.scopeNote}
                    </span>
                  )}
                  <SummaryAndRest text={shownText} nodes={impact.nodes} onOpen={setPreviewId} />
                </span>
              )}
              {answer.verdict?.inferred && (
                <span className="ml-2 inline-flex rounded bg-[#fff7ed] px-1.5 py-0.5 align-middle text-[11px] font-semibold text-[#c2410c]">Inferred</span>
              )}
            </p>}
            {!answer.records && proseBlock}
            {answer.link && (
              <Link href={answer.link.href} className="mt-2 inline-block text-[13px] font-medium text-[#5b4ce6]">{answer.link.label} →</Link>
            )}
            {(answer.fixActions?.length ?? 0) > 0 && (
              <FixActions
                actions={answer.fixActions ?? []}
                orgSlug={orgSlug}
                workspaceSlug={workspaceSlug}
                getToken={getToken}
                onSaved={(message) => setNote(message)}
              />
            )}

            {/* With the records card, a vendor lookup's table/chart would sit above the headline (its "5 vendors"
                caption looked like a stray label); its count goes into the card's summary line instead. */}
            {!revealing && answer.chart && !answer.records && <AskBarChart chart={answer.chart} />}
            {!revealing && answer.table && !answer.records && (
              <AskRichTable
                table={answer.table}
                hrefFor={(target) => richRowHref(basePath, answer.table!.kind, target, rows)}
                onOpen={(href) => router.push(href)}
                itemHref={(id) => {
                  const row = rows.find((item) => item.id === id);
                  return row ? recordHref(basePath, row) : null;
                }}
              />
            )}
            {answer.records && (
              <AskRecordsBlock
                answer={answer}
                yesNo={Boolean(answer.records.yesNo)}
                animate={Boolean(freshAt) && !edited}
                prose={proseBlock}
                extraSummary={answer.table?.kind === "vendors" ? [`${answer.table.rows.length} ${answer.table.rows.length === 1 ? "vendor" : "vendors"}`] : undefined}
                footerExtra={smallActions}
                facts={facts}
                onFilters={(filters) => setEdited({ question, filters })}
                onOpen={(row) => router.push(recordHref(basePath, row))}
                rowHref={(row) => recordHref(basePath, row)}
              />
            )}
            {!revealing && !leanCard && !answer.table && !answer.records && tableCitations(answer).length > 0 && (
              <table className="mt-6 w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
                      {(answer.handler === "impact"
                        ? ["Name", "Type", "Owner", "Criticality", "How it's connected"]
                        : ["Name", "Type", "Owner", "Criticality", "Relationship"]
                      ).map((heading) => (
                        <th key={heading} className="h-10 px-2 font-medium">{heading}</th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {tableCitations(answer).map((item, index, list) => {
                      const section = item.section && item.section !== list[index - 1]?.section ? item.section : "";
                      const count = section ? list.filter((row) => row.section === item.section).length : 0;
                      return (
                        <Fragment key={`${index}-${item.recordId}`}>
                          {section && (
                            <tr className="bg-[#fafafb]">
                              <td colSpan={6} className="px-2 py-2 text-[12px] font-semibold text-[#3c4254]">
                                {section} · {count}
                              </td>
                            </tr>
                          )}
                          <tr
                            className="cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]"
                            onClick={() => router.push(recordHref(basePath, item.row))}
                          >
                            <td className="px-2 py-2.5 font-medium">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPreviewId(item.recordId);
                                }}
                                className="font-medium text-[#4c3fd1] underline decoration-[#c9c6f5] underline-offset-2 hover:decoration-[#4c3fd1]"
                              >
                                {item.displayName || item.row.name}
                              </button>
                            </td>
                            <td className="px-2 py-2.5">{item.displayType || item.row.typeLabel}</td>
                            <td className="px-2 py-2.5">{ownerCell(item, answer.focusBlank)}</td>
                            <td className="px-2 py-2.5">{criticalityCell(item, answer.focusBlank)}</td>
                            <td className="px-2 py-2.5 text-[#6b7289]">
                              {item.relationship}
                              {item.badge ? <span className="ml-2 rounded-full bg-[#f3f4f8] px-1.5 py-0.5 text-[10px]">{item.badge}</span> : null}
                            </td>
                            <td className="text-[#94a3b8]"><ChevronRight size={14} /></td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
            )}

            {!leanCard && answer.gaps.length > 0 && <GapsList key={question} gaps={answer.gaps} />}

            {!(shownLean && !answer.records) && answer.steps && answer.steps.length > 0 && <AskSteps steps={answer.steps} timing={answer.timingLine} details={answer.timingDetails} />}

            {!leanCard && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eef0f4] pt-4">
              <button type="button" onClick={() => { saveAsk(question, answer.answerText); setNote("Saved to Reports › Saved from Ask"); }} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
                Save as report
              </button>
              <button type="button" onClick={() => { downloadCsv(answer); setNote("Exported the answer and its sources to CSV"); }} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
                Export
              </button>
              <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.href); setNote("Share link copied"); }} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
                Share
              </button>
              <span className="ml-auto text-[13px] text-[#6b7289]">Was this right?</span>
              <button type="button" onClick={() => setNote("Thanks for the feedback")} className="rounded-lg border border-[#e6e8ee] px-2.5 py-1 text-[13px]">Yes</button>
              <button type="button" onClick={() => setNote("Thanks. Tell us what was wrong.")} className="rounded-lg border border-[#e6e8ee] px-2.5 py-1 text-[13px]">No</button>
            </div>}
            {note && <p className="mt-2 text-[12px] text-[#5b4ce6]">{note}</p>}
          </div>
        )}
      </section>
      )}

      {previewId && (
        <RecordPreview
          id={previewId}
          nodes={impact.nodes}
          edges={impact.edges}
          rows={rows}
          basePath={basePath}
          onOpen={setPreviewId}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}

function ClarifyChoices({
  citations,
  followUps,
  onChoose,
}: {
  citations: AskCitation[];
  followUps: string[];
  onChoose: (question: string, focusId: string) => void;
}) {
  return (
    <>
      Did you mean{" "}
      {citations.map((item, index) => {
        const label = item.displayName || item.row.name;
        const next = followUps[index] || label;
        return (
          <span key={`${index}-${item.recordId}`}>
            {index > 0 && (index === citations.length - 1 ? " or " : ", ")}
            <button
              type="button"
              onClick={() => onChoose(next, item.recordId)}
              className="font-medium text-[#4c3fd1] underline decoration-[#c9c6f5] underline-offset-2 hover:decoration-[#4c3fd1]"
            >
              {label}
            </button>
          </span>
        );
      })}
      ?
    </>
  );
}

function LinkedNames({ text, nodes, onOpen }: { text: string; nodes: ImpactNode[]; onOpen: (id: string) => void }) {
  const parts = linkRecordNames(text, nodes);
  return (
    <>
      {parts.map((part, index) =>
        part.id ? (
          <button
            key={`${part.id}-${index}`}
            type="button"
            onClick={() => onOpen(part.id!)}
            className="font-medium text-[#4c3fd1] underline decoration-[#c9c6f5] underline-offset-2 hover:decoration-[#4c3fd1]"
          >
            {part.value}
          </button>
        ) : (
          <span key={index}>{part.value}</span>
        )
      )}
    </>
  );
}

function linkRecordNames(text: string, nodes: ImpactNode[]): { value: string; id?: string }[] {
  const ranges: { start: number; end: number; id: string }[] = [];
  const lower = text.toLowerCase();
  const sorted = [...nodes].filter((node) => node.name.trim().length >= 2).sort((a, b) => b.name.length - a.name.length);
  for (const node of sorted) {
    const needle = node.name.toLowerCase();
    let from = 0;
    while (from < text.length) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const touches = ranges.some((range) => at < range.end && end > range.start);
      if (!touches) ranges.push({ start: at, end, id: node.id });
      from = end;
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const parts: { value: string; id?: string }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push({ value: text.slice(cursor, range.start) });
    parts.push({ value: text.slice(range.start, range.end), id: range.id });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor) });
  return parts;
}

function RecordPreview({
  id,
  nodes,
  edges,
  rows,
  basePath,
  onOpen,
  onClose,
}: {
  id: string;
  nodes: ImpactNode[];
  edges: ImpactEdge[];
  rows: CatalogRow[];
  basePath: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const node = nodes.find((item) => item.id === id);
  const row = rows.find((item) => item.id === id);
  const name = row?.name || node?.name || "This item";
  const typeLabel = row?.typeLabel || node?.typeLabel || "Item";
  const owner = [row?.ownerTeam, row?.ownerPerson].filter(Boolean).join(" · ");
  const links = edges
    .filter((edge) => edge.fromId === id || edge.toId === id)
    .map((edge) => {
      const outbound = edge.fromId === id;
      const otherId = outbound ? edge.toId : edge.fromId;
      const other = nodes.find((item) => item.id === otherId);
      return {
        id: `${edge.type}:${edge.fromId}:${edge.toId}`,
        otherId,
        otherName: other?.name || "Unnamed",
        verb: relationshipVerb(edge.type as RelationshipType),
        outbound,
      };
    })
    .sort((a, b) => a.otherName.localeCompare(b.otherName));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1c2230]/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-[#1c2230]">{name}</h2>
            <p className="text-[13px] text-[#6b7289]">{typeLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-[#6b7289] hover:bg-[#f3f4f8]">
            <X size={16} />
          </button>
        </div>
        <dl className="mt-4 space-y-1 text-[13px] text-[#3c4254]">
          <div className="flex justify-between gap-3"><dt className="text-[#8b90a0]">Owner</dt><dd>{owner || "Not set"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[#8b90a0]">Criticality</dt><dd>{row?.criticalityLabel || "Not set"}</dd></div>
          {row?.annualCostNumber != null && (
            <div className="flex justify-between gap-3"><dt className="text-[#8b90a0]">Annual cost</dt><dd>{moneyLabel(row.annualCostNumber)}/yr</dd></div>
          )}
          {row?.vendor && (
            <div className="flex justify-between gap-3"><dt className="text-[#8b90a0]">Vendor</dt><dd>{row.vendor}</dd></div>
          )}
        </dl>
        <h3 className="mt-5 text-[13px] font-semibold text-[#1c2230]">Relationships</h3>
        {links.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#8b90a0]">No relationships recorded.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                {link.outbound ? (
                  <>
                    <span className="rounded-lg bg-[#f4f3ff] px-2 py-1 font-medium text-[#3f35b5]">{name}</span>
                    <span className="text-[#8b90a0]">{link.verb}</span>
                    <button type="button" onClick={() => onOpen(link.otherId)} className="rounded-lg border border-[#e6e8ee] px-2 py-1 font-medium text-[#1c2230] hover:border-[#c9c6f5]">
                      {link.otherName}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => onOpen(link.otherId)} className="rounded-lg border border-[#e6e8ee] px-2 py-1 font-medium text-[#1c2230] hover:border-[#c9c6f5]">
                      {link.otherName}
                    </button>
                    <span className="text-[#8b90a0]">{link.verb}</span>
                    <span className="rounded-lg bg-[#f4f3ff] px-2 py-1 font-medium text-[#3f35b5]">{name}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {row && (
          <Link href={recordHref(basePath, row)} className="mt-5 inline-block text-[13px] font-medium text-[#5b4ce6]">
            Open full page
          </Link>
        )}
      </div>
    </div>
  );
}

function ReportTile({ href, title, value, detail, alert }: { href: string; title: string; value: string; detail: string; alert?: boolean }) {
  return (
    <Link href={href} className="rounded-xl border border-[#e6e8ee] p-3 hover:border-[#c9c6f5]">
      <div className="text-[12px] text-[#6b7289]">{title}</div>
      <div className={`mt-2 text-[20px] font-semibold ${alert ? "text-[#b42318]" : "text-[#1c2230]"}`}>{value}</div>
      <div className="text-[12px] text-[#8b90a0]">{detail}</div>
    </Link>
  );
}

function AiCard({ card, href }: { card: AiHomeCard; href: string }) {
  return (
    <Link href={href} className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#e6e8ee] bg-[#fafafb] px-4 py-3 hover:border-[#c9c6f5]">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles size={14} className="text-[#5b4ce6]" />
        <span className="text-[14px] font-medium text-[#1c2230]">
          {card.text}
          {card.action && <span className="text-[#5b4ce6]"> · {card.action}</span>}
        </span>
        {card.flag && <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[11px] font-semibold text-[#b42318]">{card.flag}</span>}
      </div>
      <ChevronRight size={16} className="shrink-0 text-[#94a3b8]" />
    </Link>
  );
}

function FixActions({
  actions,
  orgSlug,
  workspaceSlug,
  getToken,
  onSaved,
}: {
  actions: AskFixAction[];
  orgSlug: string;
  workspaceSlug: string;
  getToken: () => Promise<string | null>;
  onSaved: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [otherOwner, setOtherOwner] = useState("");
  const [saving, setSaving] = useState(false);

  async function write(action: AskFixAction, value: string) {
    if (!orgSlug || !workspaceSlug || saving) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;
      const body = action.field === "criticality" ? { properties: { criticality: value } } : { owner: value };
      const saved = await objectsApi.update(orgSlug, workspaceSlug, action.recordId, body, token);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
      onSaved(action.field === "criticality" ? `Criticality set to ${labelFor(value)}` : `Owner set to ${value}`);
      setOpen(null);
    } catch {
      onSaved("That could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {actions.map((action, index) => {
        const key = `${index}-${action.recordId}:${action.field}`;
        const others = action.field === "criticality" ? ["low", "medium", "high"].filter((value) => value !== action.suggestedValue) : [];
        return (
          <div key={key} className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => write(action, action.suggestedValue)}
              className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {action.field === "criticality" ? `Set criticality: ${labelFor(action.suggestedValue)}` : `Set owner: ${action.suggestedValue}`}
            </button>
            <button type="button" onClick={() => setOpen(open === key ? null : key)} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
              Other…
            </button>
            {open === key && action.field === "criticality" && others.map((value) => (
              <button key={value} type="button" disabled={saving} onClick={() => write(action, value)} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
                {labelFor(value)}
              </button>
            ))}
            {open === key && action.field === "owner" && (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (otherOwner.trim()) write(action, otherOwner.trim());
                }}
              >
                <input value={otherOwner} onChange={(event) => setOtherOwner(event.target.value)} placeholder="Owner" className="rounded-lg border border-[#e6e8ee] px-2 py-1 text-[13px]" />
                <button type="submit" disabled={saving || !otherOwner.trim()} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
                  Save
                </button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GapsList({ gaps }: { gaps: { text: string; fillHref: string }[] }) {
  const [open, setOpen] = useState(false);
  const visible = open ? gaps : gaps.slice(0, 2);
  const hidden = gaps.length - 2;
  return (
    <div className="mt-4 rounded-xl border border-[#fde7b8] bg-[#fff8eb] px-4 py-3 text-[13px] text-[#78350f]">
      <div className="font-semibold text-[#92400e]">Gaps</div>
      {visible.map((gap, index) => (
        <p key={`${index}-${gap.text}`} className="mt-1">
          {gap.text}{" "}
          <Link href={gap.fillHref} className="font-medium text-[#5b4ce6]">Fill in</Link>
        </p>
      ))}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 font-medium text-[#5b4ce6]">
          {open ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </div>
  );
}

function labelFor(value: string): string {
  if (value === "high") return "High";
  if (value === "medium") return "Medium";
  if (value === "low") return "Low";
  return value;
}

/** Step 3: the first sentence is the summary line on top; the rest follows in normal weight. */
function SummaryAndRest({ text, nodes, onOpen }: { text: string; nodes: Parameters<typeof AnswerText>[0]["nodes"]; onOpen: (id: string) => void }) {
  const { summary, rest } = splitSummary(text);
  return (
    <>
      <span data-testid="ask-summary" className="block text-[18px] font-semibold leading-7">
        <AnswerText text={summary} nodes={nodes} onOpen={onOpen} />
      </span>
      {rest && (
        <span className="mt-2 block">
          <AnswerText text={rest} nodes={nodes} onOpen={onOpen} />
        </span>
      )}
    </>
  );
}

/** Earlier turns of this tab's conversation as one line of question chips (click to ask again). */
function ConversationThread({
  turns,
  onAsk,
  onNew,
}: {
  turns: ThreadTurn[];
  hrefFor?: (id: string) => string | null;
  onAsk: (question: string) => void;
  onNew: () => void;
}) {
  return (
    <div data-testid="ask-thread" className="-mt-3 mb-4 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[12px] text-[#6b7289]">
      <span className="shrink-0">Earlier ·</span>
      <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
        {turns.slice(-6).map((turn, index) => (
          <button
            key={`${index}-${turn.at}`}
            type="button"
            data-testid="ask-thread-turn"
            title={turn.summary || turn.question}
            onClick={() => onAsk(turn.question)}
            className="max-w-[220px] shrink-0 truncate rounded-full border border-[#e6e8ee] bg-white px-2.5 py-0.5 text-[#3c4254] hover:border-[#c9c6f5]"
          >
            {shortQuestion(turn.question)}
          </button>
        ))}
      </div>
      <button type="button" onClick={onNew} className="shrink-0 font-medium text-[#5b4ce6] hover:underline">
        New conversation
      </button>
    </div>
  );
}

/** "What Microsoft products do we own?" -> "Microsoft products?" for a chip. */
export function shortQuestion(question: string): string {
  const q = question.trim().replace(/\s+/g, " ");
  const cut = q.replace(/^(what|which|show me|list)\s+(?=\S+\s+(products|apps|applications|items|tools|platforms))/i, "").replace(/\s+(do|does|did|are|is)\s+(we|you|our company)\s+(own|have|use|run)\??$/i, "?");
  const out = cut === q ? q : cut.charAt(0).toUpperCase() + cut.slice(1);
  return out.length > 40 ? `${out.slice(0, 38)}…` : out;
}

/** The short "No" card: headline, one line, How I found this and two actions. */
export function LeanAnswer({ lean, basePath, footerExtra, onAdd, onPick, items = [], rowHref, steps, timing, timingDetails }: { lean: NonNullable<AskAnswer["lean"]>; basePath: string; footerExtra: ReactNode; onAdd: (name: string) => void; onPick: (filters: RecordFilters) => void; items?: CatalogRow[]; rowHref: (row: CatalogRow) => string; steps?: AskStep[]; timing?: string; timingDetails?: AskTimingDetails }) {
  return (
    <div data-testid="ask-lean">
      <h2 data-testid="ask-lean-headline" className="text-[20px] font-bold leading-7 text-[#1c2230]">{lean.headline}</h2>
      {lean.sub && <p data-testid="ask-lean-sub" className="mt-1.5 text-[13px] text-[#6b7289]">{lean.sub}</p>}
      {items.length > 0 && (
        <table className="mt-3 w-full text-left text-[13px]" data-testid="ask-name-matches">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Name", "Kind", "Owner"].map((heading) => <th key={heading} className="h-9 px-2 font-medium">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 5).map((row) => (
              <tr key={row.id} className="border-b border-[#f3f4f8]">
                <td className="px-2 py-2"><a href={rowHref(row)} className="font-medium text-[#4c3fd1] underline decoration-[#c9c6f5] underline-offset-2">{row.name}</a></td>
                <td className="px-2 py-2">{row.typeLabel}</td>
                <td className="px-2 py-2">{[row.ownerTeam, row.ownerPerson].filter(Boolean).join(" · ") || <span className="rounded bg-[#fff7ed] px-1.5 py-0.5 text-[11px] text-[#9a3412]">No owner</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-3 flex flex-wrap items-start gap-2 text-[12px]">
        <details className="group min-w-0 flex-1" data-testid="ask-how">
          <summary className="cursor-pointer list-none font-semibold text-[#5b4ce6] [&::-webkit-details-marker]:hidden"><span className="inline-block transition-transform group-open:rotate-90">▸</span> {lean.how || lean.name ? "How I found this" : `How this was worked out${steps?.length ? ` · ${steps.length} steps` : ""}`}</summary>
          {(lean.how || lean.name) && (
            <p className="mt-2 text-[13px] text-[#4a5068]">
              {lean.how ?? `Looked for “${lean.name}” as a whole word in item names, in vendor fields and in the tool catalogue${lean.searched != null ? ` across ${lean.searched} items` : ""}. Nothing matched. No AI used.`}
            </p>
          )}
          {(steps?.length ?? 0) > 0 && (
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-[#4a5068]" data-testid="ask-lean-steps">
              {steps!.map((item) => <li key={item.id} className={item.status === "error" ? "text-[#a35a00]" : ""}>{item.label}</li>)}
            </ol>
          )}
          {/* The short "No"/unsupported AI card used to drop the timing (only AskSteps carried it). */}
          <AskTimingBlock timing={timing} details={timingDetails} />
        </details>
        <div className="flex flex-wrap items-center gap-1.5">
          {(lean.suggest ?? []).slice(0, 2).map((item) => <FollowPill key={item.label} label={item.label} onClick={() => onPick(item.filters)} />)}
          {!lean.suggest?.length && lean.name && !lean.noAdd && <FollowPill label={`+ Add ${lean.name}`} onClick={() => onAdd(lean.name!)} />}
          {!lean.suggest?.length && <FollowPill label="See all apps" href={modelPath(basePath, "applications")} />}
        </div>
      </div>
      {footerExtra}
    </div>
  );
}

function tableCitations(answer: AskAnswer): AskCitation[] {
  if (answer.handler === "clarify") return [];
  if (answer.evidence && answer.evidence.length > 0) return [];
  if (answer.handler !== "impact") return answer.citations;
  return answer.citations.filter((item) => item.n !== 1);
}

function ownerCell(item: AskCitation, focus: AskAnswer["focusBlank"]) {
  const owner = item.row.ownerTeam || item.row.ownerPerson;
  if (owner) return owner;
  if (focus === "owner") return <span className="rounded bg-[#fff7ed] px-1.5 py-0.5 text-[#c2410c]">No owner · Add</span>;
  return <span className="text-[#b0b4c0]">—</span>;
}

function criticalityCell(item: AskCitation, focus: AskAnswer["focusBlank"]) {
  if (item.row.criticalityLabel) return <Pill label={item.row.criticalityLabel} tone="criticality" />;
  if (focus === "criticality") return <span className="text-[#c2410c]">Add</span>;
  return <span className="text-[#b0b4c0]">—</span>;
}

/** Rich table rows: a vendor opens its vendor record; anything else opens the item's record. */
function richRowHref(basePath: string, kind: string, target: { recordId: string | null; label: string }, rows: CatalogRow[]): string | null {
  if (kind === "vendors") return modelItemPath(basePath, "vendors", target.label);
  const row = target.recordId ? rows.find((item) => item.id === target.recordId) : undefined;
  return row ? recordHref(basePath, row) : null;
}

function recordHref(basePath: string, row: { id: string; kind: string; object?: { type?: string } }): string {
  if (row.object?.type === "agent") return modelItemPath(basePath, "agents", row.id);
  if (row.object?.type === "ai_model") return modelItemPath(basePath, "ai-models", row.id);
  if (row.object?.type === "tool") return modelItemPath(basePath, "infrastructure", row.id);
  return modelItemPath(basePath, row.kind === "application" ? "applications" : row.kind === "platform" ? "platforms" : "servers", row.id);
}

function AnswerText({ text, nodes, onOpen }: { text: string; nodes: ImpactNode[]; onOpen: (id: string) => void }) {
  const parts = text.replace(/\s*\[\d+\]/g, "").split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return <LinkedNames key={index} text={part} nodes={nodes} onOpen={onOpen} />;
      })}
    </>
  );
}

function saveAsk(question: string, prose: string) {
  const key = "bubomap-saved-asks";
  const current = JSON.parse(window.localStorage.getItem(key) || "[]") as { q: string; prose: string; at: string }[];
  current.unshift({ q: question, prose, at: new Date().toISOString() });
  window.localStorage.setItem(key, JSON.stringify(current.slice(0, 20)));
}

function downloadCsv(answer: AskAnswer) {
  const header = ["Name", "Type", "Owner", "Criticality", "Relationship"];
  const lines = answer.citations.map((item) =>
    [item.displayName || item.row.name, item.displayType || item.row.typeLabel, item.row.ownerTeam || item.row.ownerPerson, item.row.criticalityLabel, item.relationship]
      .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ask-answer.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** What to say when the AI's answer isn't shown, by the server's fallback reason. */
export function aiFallbackNote(reason: string | null | undefined, modelSaidUnsupported: boolean): { title: string; body: string; blocked: boolean } | null {
  if (modelSaidUnsupported) return { title: "The AI looked too.", body: "It found nothing in your workspace it could cite, so it didn't guess.", blocked: false };
  switch (reason) {
    case null:
    case undefined:
    case "empty":
    case "no_workspace":
    case "limit": // its own notice
      return null;
    case "model_unavailable":
      return { title: "The AI isn't available for this workspace.", body: "Quick answers below still work.", blocked: true };
    case "too_many_lookups":
    case "round_budget":
      return { title: "The AI couldn't finish a checked answer.", body: "It needed more lookups than allowed. Try a narrower question.", blocked: false };
    case "timeout":
      return { title: "The AI took too long.", body: "Try again, or ask a narrower question.", blocked: true };
    case "max_tokens":
    case "empty_reply":
    case "malformed_call":
      return { title: "The AI's reply came back empty.", body: "Try again; the reason is in How this was worked out.", blocked: true };
    case "blocked":
      return { title: "The AI declined to answer this.", body: "Try rewording the question.", blocked: false };
    case "not_json":
    case "ungrounded_number":
    case "unknown_record":
    case "marker_without_citation":
    case "citations_not_a_list":
    case "evidence_not_a_list":
    case "evidence_citation":
    case "inferred_without_evidence":
    case "uncited_fix_action":
    case "unknown_gap":
    case "vendor_count":
      return { title: "The AI's answer didn't pass the check.", body: "It used a name or number the lookups didn't return, so it isn't shown.", blocked: false };
    default: // model_error, stream_failed, request_failed, server_error, anything new
      return { title: "The AI is unavailable right now.", body: "Try again in a few minutes; quick answers below still work.", blocked: true };
  }
}

/** Short, secret-free text for a failed Ask request ("HTTP 504", "Failed to fetch"). */
export function requestError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const status = (error as { status?: number } | null)?.status;
  const text = message.replace(/(AIza[0-9A-Za-z_-]{10,}|Bearer\s+\S+)/g, "[redacted]").replace(/\s+/g, " ").slice(0, 120);
  return [status ? `HTTP ${status}` : "", text].filter(Boolean).join(" ") || "unknown error";
}

/** The grey line under a fallback headline: what the name search found instead. */
export function fallbackSub(matches: AskAnswer["nameMatches"]): string {
  if (!matches) return "No names in this workspace match words in the question.";
  const fixed = matches.corrected.length ? ` (${matches.corrected.join(", ")})` : "";
  return matches.count
    ? `Showing ${matches.count} name match${matches.count === 1 ? "" : "es"} from your workspace instead${fixed}.`
    : "No names in this workspace match words in the question.";
}
