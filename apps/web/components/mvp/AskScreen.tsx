"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { addApi, aiApi, objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { askPath, modelItemPath, modelPath, reportPath } from "@/lib/mvp-paths";
import { ASK_BAR_ID } from "@/components/nav/ask-shortcut";
import { catalogStats, moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import { askChips, popularCards, supportCounts } from "@/lib/reports/home";
import { useAppStore } from "@/lib/store";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { answerFromModel, answerFromRecords, type AskAnswer, type AskCitation, type AskFixAction } from "@/lib/ask/deterministic";
import { splitSummary } from "@/lib/ask/rich";
import { AskBarChart, AskRichTable } from "@/components/mvp/AskRich";
import { followUpsFor, pickAnswer, shouldAskModel, workingLine } from "@/lib/ask/route";
import { AskLiveSteps, AskSteps } from "@/components/mvp/AskSteps";
import type { AskStep } from "@/lib/api-client";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { AddSaved } from "@/components/add/AddCards";
import { AddFlow } from "@/components/add/AddFlow";
import { FirstRunAsk, SetupCard } from "@/components/mvp/FirstRunAsk";
import { addAnywhereEnabled, askStreamEnabled } from "@/lib/flags";
import { addListText, classifyAddIntent, prefixAdd } from "@/lib/setup/add-intent";
import { undoneSentence, readAddReceipt, writeAddReceipt, type AddReceipt } from "@/lib/setup/add-cards";
import { askListKind } from "@/lib/setup/type-guidance";
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
  const initial = mode === "answer" ? params.get("q") ?? "" : "";
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
  const question = initial.trim();
  const focusId = mode === "answer" ? params.get("focus") ?? undefined : undefined;

  const impactQuery = /break|fail|goes down|is down|outage|depend|impact|important|how critical|live without|who owns|\bsso\b|single sign|sign ?in|sign-in|log ?in|login/i.test(question);
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

  const local = useMemo(
    () =>
      answerFromRecords({
        question,
        rows,
        graph: { nodes: impact.nodes, edges: impact.edges },
        basePath,
        loading: impactQuery && impact.isLoading,
        focusId,
        landscape: catalog.data ? { objects: catalog.data.objects, relationships: catalog.data.relationships } : undefined,
      }),
    [question, rows, impact.nodes, impact.edges, impact.isLoading, impactQuery, basePath, focusId, catalog.data]
  );

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
  const [live, setLive] = useState<{ question: string; steps: AskStep[]; text: string }>({ question: "", steps: [], text: "" });
  const remote = useQuery({
    queryKey: ["ask-model", orgSlug, workspaceSlug, question],
    enabled: askModel,
    retry: false,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      if (!askStreamEnabled()) return aiApi.ask(orgSlug, workspaceSlug, question, token);
      setLive({ question, steps: [], text: "" });
      return aiApi.askStream(orgSlug, workspaceSlug, question, token, {
        onStep: (step) => setLive((cur) => (cur.question === question ? { ...cur, steps: [...cur.steps, step] } : cur)),
        onText: (text) => setLive((cur) => (cur.question === question ? { ...cur, text } : cur)),
      });
    },
  });
  const liveNow = live.question === question ? live : { steps: [], text: "" };


  // A disabled query stays "pending" in react-query v5, so only a model we actually asked counts.
  const thinking =
    mode === "answer" && question.length > 0 && !showingAdd && !ambiguous && (!catalogSettled || (askModel && remote.isPending));
  useEffect(() => {
    setDraft(question);
  }, [question]);

  const answer = useMemo(() => {
    if (mode !== "answer" || !question) return local;
    const fromModel = askModel && remote.data ? answerFromModel(remote.data, rows, basePath, question) : null;
    return pickAnswer(local, fromModel, question, askModel ? remote.data?.steps : undefined);
  }, [mode, question, askModel, remote.data, local, rows, basePath]);

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
      {visibleReceipt ? (
        <AddSaved added={visibleReceipt.added} kept={visibleReceipt.kept} todos={visibleReceipt.todos} canUndo={visibleReceipt.canUndo && Date.now() < visibleReceipt.undoUntil} motion={false} onUndo={() => void undoAdd()} />
      ) : showingAdd ? (
        <AddFlow origin="ask" kind={askListKind(addListText(question))} initialText={addListText(question)} onSaved={rememberAdd} onClose={() => setReadAs("ask")} />
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
            <Sparkles size={12} /> ANSWER
          </p>
          {thinking && <span className="max-w-[70%] truncate text-[12px] font-medium text-[#5b4ce6]">Working on “{question}”</span>}
        </div>
        {thinking ? (
          <div className="px-5 py-6">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#ece9ff]">
              <div className="diagram-saving-bar-indeterminate h-full w-2/5 rounded-full bg-[#5b4ce6]" />
            </div>
            <p data-testid="ask-working" className="mt-4 text-[15px] font-medium text-[#1c2230]">
              {catalogSettled ? workingLine(rows.length) : "Loading your estate"}
            </p>
            <AskLiveSteps steps={liveNow.steps} text={liveNow.text} />
          </div>
        ) : (
          <div className="px-5 py-5">
            <p className="text-[17px] leading-7 text-[#1c2230]">
              {answer.handler === "clarify" ? (
                <ClarifyChoices
                  citations={answer.citations}
                  followUps={answer.followUps}
                  onChoose={submit}
                />
              ) : (
                <SummaryAndRest text={answer.answerText} nodes={impact.nodes} onOpen={setPreviewId} />
              )}
              {answer.verdict?.inferred && (
                <span className="ml-2 inline-flex rounded bg-[#fff7ed] px-1.5 py-0.5 align-middle text-[11px] font-semibold text-[#c2410c]">Inferred</span>
              )}
            </p>
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

            {answer.chart && <AskBarChart chart={answer.chart} />}
            {answer.table && (
              <AskRichTable
                table={answer.table}
                hrefFor={(id) => {
                  const row = rows.find((item) => item.id === id);
                  return row ? recordHref(basePath, row) : null;
                }}
              />
            )}
            {!answer.table && tableCitations(answer).length > 0 && (
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

            {answer.gaps.length > 0 && <GapsList key={question} gaps={answer.gaps} />}

            {answer.steps && answer.steps.length > 0 && <AskSteps steps={answer.steps} />}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eef0f4] pt-4">
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
            </div>
            {note && <p className="mt-2 text-[12px] text-[#5b4ce6]">{note}</p>}
          </div>
        )}
      </section>
      )}

      {!showingAdd && !ambiguous && !thinking && answer.handler !== "clarify" && followUpsFor(answer.followUps, question).length > 0 && (
        <div className="mt-5 rounded-2xl border border-[#e6e8ee] bg-[#fafafb] px-5 py-4">
          <p className="mb-2 text-[13px] font-medium text-[#1c2230]">Ask next</p>
          <div className="flex flex-wrap gap-2">
            {followUpsFor(answer.followUps, question).map((follow) => (
              <button key={follow} type="button" onClick={() => submit(follow)} className="rounded-full border border-[#e6e8ee] bg-white px-3 py-1.5 text-[13px] text-[#3c4254] hover:border-[#c9c6f5]">
                {follow}
              </button>
            ))}
          </div>
        </div>
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
      {actions.map((action) => {
        const key = `${action.recordId}:${action.field}`;
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

function recordHref(basePath: string, row: { id: string; kind: string; object?: { type?: string } }): string {
  if (row.object?.type === "agent") return modelItemPath(basePath, "agents", row.id);
  if (row.object?.type === "ai_model") return modelItemPath(basePath, "ai-models", row.id);
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
