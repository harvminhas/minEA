"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { usePermissions } from "@/lib/use-permissions";
import { journeysApi, objectsApi, processesApi } from "@/lib/api-client";
import {
  JourneyFlowCanvas,
  type SelectedEdge,
  type StepDraft,
} from "@/components/views/JourneyFlowCanvas";
import { AddJourneyPathDialog } from "@/components/views/AddJourneyPathDialog";
import { StepDetailPanel } from "@/components/views/StepDetailPanel";
import { DeleteStageConfirmDialog } from "@/components/views/DeleteStageConfirmDialog";
import {
  canAutosave,
  canPublish,
  defaultBranchPosition,
  edgeExists,
  edgesFromJourney,
  journeyFromSnapshot,
  layoutFromIndexed,
  newEdgeDraft,
  newStepDraft,
  removeEdgesForStep,
  serializeJourneyState,
  stepsFromJourney,
  type EdgeDraft,
  type EdgeLabelLayoutMap,
  type JourneyEdgeTransition,
  type NodeLayoutMap,
} from "@/lib/journey-state";
import type { Journey } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: Journey;
  onClose: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function JourneyBuilder({ initialValues, onClose }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const { isReadOnly } = usePermissions();

  const initialDrafts = stepsFromJourney(initialValues);
  const initialEdges = edgesFromJourney(initialValues, initialDrafts);
  const initialLayout = layoutFromIndexed(initialDrafts, initialValues?.canvas_layout, initialEdges);

  const [journeyId, setJourneyId] = useState<string | null>(initialValues?.id ?? null);
  const [displayStatus, setDisplayStatus] = useState(initialValues?.status ?? "draft");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [owner, setOwner] = useState(initialValues?.owner ?? "");
  const [customerSegment, setCustomerSegment] = useState(initialValues?.customer_segment ?? "");
  const [steps, setSteps] = useState<StepDraft[]>(() => initialDrafts);
  const [graphEdges, setGraphEdges] = useState<EdgeDraft[]>(() => initialEdges);
  const [nodeLayout, setNodeLayout] = useState<NodeLayoutMap>(() => initialLayout.nodeLayout);
  const [edgeLabelLayout, setEdgeLabelLayout] = useState<EdgeLabelLayoutMap>(
    () => initialLayout.edgeLabelLayout
  );
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const [addPathSourceId, setAddPathSourceId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    initialValues
      ? serializeJourneyState(
          initialValues.name,
          initialValues.owner ?? "",
          initialValues.customer_segment ?? "",
          initialDrafts,
          initialEdges,
          initialLayout.nodeLayout,
          initialLayout.edgeLabelLayout
        )
      : ""
  );
  const [publishedSnapshot, setPublishedSnapshot] = useState(() =>
    initialValues?.status === "live"
      ? serializeJourneyState(
          initialValues.name,
          initialValues.owner ?? "",
          initialValues.customer_segment ?? "",
          initialDrafts,
          initialEdges,
          initialLayout.nodeLayout,
          initialLayout.edgeLabelLayout
        )
      : null
  );

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const journeyIdRef = useRef(journeyId);
  journeyIdRef.current = journeyId;
  const draftRef = useRef({
    name,
    owner,
    customerSegment,
    steps,
    graphEdges,
    nodeLayout,
    edgeLabelLayout,
  });
  draftRef.current = { name, owner, customerSegment, steps, graphEdges, nodeLayout, edgeLabelLayout };

  const { data: processesData } = useQuery({
    queryKey: ["processes", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return processesApi.list(orgSlug, workspaceSlug, token!);
    },
  });

  const { data: systemsData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!);
    },
  });

  const processes = processesData?.items ?? [];
  const systems = systemsData?.items ?? [];
  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null;
  const addPathSourceStep = steps.find((s) => s.id === addPathSourceId) ?? null;
  const addPathSourceIndex = addPathSourceStep ? steps.indexOf(addPathSourceStep) : -1;
  const totalProcesses = new Set(steps.flatMap((s) => s.process_ids)).size;

  const selectedProcessIds = selectedStep?.process_ids ?? [];
  const { data: derivedSystemsData } = useQuery({
    queryKey: ["journey-derived-systems", orgSlug, workspaceSlug, selectedProcessIds],
    queryFn: async () => {
      if (!selectedProcessIds.length) return { items: [] };
      const token = await getToken();
      return journeysApi.deriveSystems(orgSlug, workspaceSlug, selectedProcessIds, token!);
    },
    enabled: selectedProcessIds.length > 0,
  });
  const derivedSystems = derivedSystemsData?.items ?? [];

  const connectedTargetsForAddPath = useMemo(() => {
    if (!addPathSourceId) return new Set<string>();
    return new Set(graphEdges.filter((e) => e.sourceId === addPathSourceId).map((e) => e.targetId));
  }, [addPathSourceId, graphEdges]);

  const currentSnapshot = useMemo(
    () =>
      serializeJourneyState(name, owner, customerSegment, steps, graphEdges, nodeLayout, edgeLabelLayout),
    [name, owner, customerSegment, steps, graphEdges, nodeLayout, edgeLabelLayout]
  );

  const isDirty = savedSnapshot !== "" && currentSnapshot !== savedSnapshot;
  const isUnsavedNew = savedSnapshot === "" && canAutosave(name, steps);
  const hasUnsavedChanges = isDirty || isUnsavedNew;

  const differsFromPublished =
    publishedSnapshot === null || currentSnapshot !== publishedSnapshot;

  const publishReady =
    !!journeyId && !hasUnsavedChanges && differsFromPublished && canPublish(name, steps);

  const addStep = useCallback(() => {
    const step = newStepDraft(steps.length);
    setSteps((prev) => {
      const next = [...prev, step];
      if (prev.length > 0) {
        const prevStep = prev[prev.length - 1]!;
        setGraphEdges((edges) =>
          edgeExists(edges, prevStep.id, step.id) ? edges : [...edges, newEdgeDraft(prevStep.id, step.id)]
        );
      }
      return next;
    });
    setSelectedStepId(step.id);
  }, [steps.length]);

  const selectStep = useCallback((id: string) => {
    setSelectedStepId(id);
    setSelectedEdge(null);
  }, []);

  const selectEdge = useCallback((edge: SelectedEdge | null) => {
    setSelectedEdge(edge);
    if (edge) setSelectedStepId(null);
  }, []);

  const updateEdgeTransition = useCallback(
    (sourceId: string, targetId: string, transition: JourneyEdgeTransition) => {
      setGraphEdges((prev) =>
        prev.map((edge) =>
          edge.sourceId === sourceId && edge.targetId === targetId ? { ...edge, transition } : edge
        )
      );
    },
    []
  );

  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, position: i })));
    setGraphEdges((prev) => removeEdgesForStep(prev, id));
    setNodeLayout((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEdgeLabelLayout((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([edgeId]) => !edgeId.includes(id)))
    );
    setSelectedStepId((current) => (current === id ? null : current));
    setSelectedEdge((current) =>
      current?.sourceId === id || current?.targetId === id ? null : current
    );
    setAddPathSourceId((current) => (current === id ? null : current));
  }, []);

  const requestAddPath = useCallback((sourceId: string) => {
    setAddPathSourceId(sourceId);
    setSelectedStepId(null);
    setSelectedEdge(null);
  }, []);

  const addPathToExisting = useCallback(
    (targetId: string) => {
      if (!addPathSourceId || edgeExists(graphEdges, addPathSourceId, targetId)) return;
      setGraphEdges((prev) => [...prev, newEdgeDraft(addPathSourceId, targetId)]);
      setAddPathSourceId(null);
    },
    [addPathSourceId, graphEdges]
  );

  const addPathToNewStep = useCallback(() => {
    if (!addPathSourceId) return;
    const step = newStepDraft(steps.length);
    const position = defaultBranchPosition(addPathSourceId, steps, nodeLayout, graphEdges);
    setSteps((prev) => [...prev, step]);
    setNodeLayout((prev) => ({ ...prev, [step.id]: position }));
    setGraphEdges((prev) => [...prev, newEdgeDraft(addPathSourceId, step.id)]);
    setAddPathSourceId(null);
    setSelectedStepId(step.id);
  }, [addPathSourceId, steps, nodeLayout, graphEdges]);

  const requestDeleteStep = useCallback((id: string, stepTitle: string) => {
    setPendingDelete({ id, name: stepTitle });
  }, []);

  const confirmDeleteStep = () => {
    if (!pendingDelete) return;
    removeStep(pendingDelete.id);
    setPendingDelete(null);
  };

  useEffect(() => {
    if (isReadOnly) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Tab" &&
        !e.shiftKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "SELECT"
      ) {
        e.preventDefault();
        addStep();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addStep, isReadOnly]);

  const handleLayoutChange = useCallback(
    (nextNodeLayout: NodeLayoutMap, nextEdgeLabelLayout: EdgeLabelLayoutMap) => {
      setNodeLayout(nextNodeLayout);
      setEdgeLabelLayout(nextEdgeLabelLayout);
    },
    []
  );

  const resetLayout = useCallback(() => {
    setNodeLayout({});
    setEdgeLabelLayout({});
  }, []);

  const updateStep = (updated: StepDraft) => {
    setSteps((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const saveMutation = useMutation({
    mutationFn: async ({ status }: { status: "draft" | "live" }) => {
      const token = await getToken();
      const {
        name: n,
        owner: o,
        customerSegment: cs,
        steps: s,
        graphEdges: ge,
        nodeLayout: nl,
        edgeLabelLayout: el,
      } = draftRef.current;
      const payload = { ...journeyFromSnapshot(n, o, cs, s, ge, nl, el), status };
      const id = journeyIdRef.current;
      if (id) {
        return journeysApi.update(orgSlug, workspaceSlug, id, payload, token!);
      }
      return journeysApi.create(orgSlug, workspaceSlug, payload, token!);
    },
    onSuccess: (saved, { status }) => {
      const newDrafts = stepsFromJourney(saved);
      const newEdges = edgesFromJourney(saved, newDrafts);
      const savedLayout = layoutFromIndexed(newDrafts, saved.canvas_layout, newEdges);
      setJourneyId(saved.id);
      journeyIdRef.current = saved.id;
      setName(saved.name);
      setOwner(saved.owner ?? "");
      setCustomerSegment(saved.customer_segment ?? "");
      setDisplayStatus(saved.status);
      setSteps(newDrafts);
      setGraphEdges(newEdges);
      setNodeLayout(savedLayout.nodeLayout);
      setEdgeLabelLayout(savedLayout.edgeLabelLayout);
      setSelectedStepId((current) => {
        if (!current) return null;
        const idx = steps.findIndex((s) => s.id === current);
        return idx >= 0 ? newDrafts[idx]?.id ?? null : null;
      });
      const snapshot = serializeJourneyState(
        saved.name,
        saved.owner ?? "",
        saved.customer_segment ?? "",
        newDrafts,
        newEdges,
        savedLayout.nodeLayout,
        savedLayout.edgeLabelLayout
      );
      setSavedSnapshot(snapshot);
      setSaveError(null);
      if (status === "live") {
        setPublishedSnapshot(snapshot);
        setDisplayStatus("live");
      }
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["journeys", orgSlug, workspaceSlug] });
    },
    onError: (err) => {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Could not save draft");
    },
  });

  useEffect(() => {
    if (isReadOnly) return;
    if (!canAutosave(name, steps)) return;
    if (savedSnapshot !== "" && currentSnapshot === savedSnapshot) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      if (savingRef.current) return;
      if (!canAutosave(name, steps)) return;
      if (savedSnapshot !== "" && currentSnapshot === savedSnapshot) return;

      savingRef.current = true;
      setSaveStatus("saving");
      setSaveError(null);
      try {
        await saveMutation.mutateAsync({ status: "draft" });
      } catch {
        // onError handler sets status
      } finally {
        savingRef.current = false;
      }
    }, 1200);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [
    name,
    owner,
    customerSegment,
    steps,
    graphEdges,
    nodeLayout,
    edgeLabelLayout,
    currentSnapshot,
    savedSnapshot,
    isReadOnly,
  ]);

  const handlePublish = async () => {
    await saveMutation.mutateAsync({ status: "live" });
  };

  const saveIndicator =
    saveStatus === "saving"
      ? "Saving draft…"
      : saveStatus === "error"
        ? "Could not save draft"
        : hasUnsavedChanges
          ? "Unsaved changes"
          : journeyId
            ? "Draft saved"
            : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[60]" onClick={onClose} />
      <div className="fixed inset-3 md:inset-5 bg-white rounded-xl shadow-2xl z-[70] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isReadOnly}
              placeholder="Journey name, e.g. Customer onboarding"
              className="text-xl font-semibold text-gray-900 w-full border border-transparent hover:border-gray-200 focus:border-indigo-300 rounded-md px-2 -mx-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-300"
            />
            <p className="text-sm text-gray-400 mt-0.5 px-2 -mx-2">
              Map a journey as connected steps linked to underlying processes
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3 px-2 -mx-2">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                readOnly={isReadOnly}
                placeholder="Owner: CX team"
                className="text-xs border border-gray-200 rounded-full px-3 py-1 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-auto min-w-[160px]"
              />
              <input
                value={customerSegment}
                onChange={(e) => setCustomerSegment(e.target.value)}
                readOnly={isReadOnly}
                placeholder="Segment: SMB merchants"
                className="text-xs border border-gray-200 rounded-full px-3 py-1 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-auto min-w-[180px]"
              />
              <span className="text-xs border border-gray-200 rounded-full px-3 py-1 text-gray-500 capitalize">
                {displayStatus}
              </span>
              {saveIndicator && (
                <span
                  className={cn(
                    "text-xs rounded-full px-3 py-1",
                    saveStatus === "error"
                      ? "bg-red-50 text-red-600 border border-red-100"
                      : hasUnsavedChanges
                        ? "bg-amber-50 text-amber-700 border border-amber-100"
                        : "bg-gray-50 text-gray-500 border border-gray-200"
                  )}
                >
                  {saveIndicator}
                </span>
              )}
              {totalProcesses > 0 && (
                <span className="inline-flex items-center gap-1 text-xs border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-full px-3 py-1">
                  <Sparkles size={11} />
                  {steps.length} step{steps.length === 1 ? "" : "s"} · {totalProcesses} linked process
                  {totalProcesses === 1 ? "" : "es"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-md hover:bg-gray-100 text-gray-400"
            >
              <X size={18} />
            </button>
            {!isReadOnly && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={!publishReady || saveMutation.isPending}
                className="bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-md px-4 py-2 text-sm font-medium"
                title={
                  !journeyId
                    ? "Wait for draft to save"
                    : hasUnsavedChanges
                      ? "Wait for unsaved changes to sync"
                      : !differsFromPublished
                        ? "No changes since last publish"
                        : !canPublish(name, steps)
                          ? "Add a name and at least one titled step"
                          : undefined
                }
              >
                {saveMutation.isPending ? "Publishing…" : "Publish"}
              </button>
            )}
          </div>
        </div>

        {saveError && (
          <p className="px-6 py-2 text-xs text-red-600 border-b border-red-50 bg-red-50">{saveError}</p>
        )}

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 relative">
            {steps.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center bg-[#fafafa]">
                {isReadOnly ? (
                  <p className="text-sm text-gray-500">No steps in this journey.</p>
                ) : (
                  <button
                    type="button"
                    onClick={addStep}
                    className={cn(
                      "rounded-xl border-2 border-dashed border-gray-300 px-10 py-8",
                      "hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-center"
                    )}
                  >
                    <p className="text-sm font-medium text-gray-600 mb-1">Add your first step</p>
                    <p className="text-xs text-gray-400">Click here or press Tab</p>
                  </button>
                )}
              </div>
            ) : (
              <JourneyFlowCanvas
                steps={steps}
                graphEdges={graphEdges}
                nodeLayout={nodeLayout}
                edgeLabelLayout={edgeLabelLayout}
                selectedStepId={selectedStepId}
                selectedEdge={selectedEdge}
                onSelectStep={selectStep}
                onSelectEdge={selectEdge}
                onUpdateEdgeTransition={isReadOnly ? () => {} : updateEdgeTransition}
                onLayoutChange={isReadOnly ? () => {} : handleLayoutChange}
                onResetLayout={isReadOnly ? () => {} : resetLayout}
                onAddStep={isReadOnly ? () => {} : addStep}
                onRequestAddPath={isReadOnly ? () => {} : requestAddPath}
                onRequestDeleteStep={isReadOnly ? () => {} : requestDeleteStep}
              />
            )}
          </div>

          {selectedStep && (
            <StepDetailPanel
              step={selectedStep}
              processes={processes}
              systems={systems}
              derivedSystems={derivedSystems}
              onSave={updateStep}
              onRequestDelete={requestDeleteStep}
              onClose={() => setSelectedStepId(null)}
            />
          )}
        </div>
      </div>

      {!isReadOnly && pendingDelete && (
        <DeleteStageConfirmDialog
          stageName={pendingDelete.name}
          onConfirm={confirmDeleteStep}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {!isReadOnly && addPathSourceStep && addPathSourceIndex >= 0 && (
        <AddJourneyPathDialog
          sourceStep={addPathSourceStep}
          sourceIndex={addPathSourceIndex}
          steps={steps}
          connectedTargetIds={connectedTargetsForAddPath}
          onSelectExisting={addPathToExisting}
          onCreateNew={addPathToNewStep}
          onCancel={() => setAddPathSourceId(null)}
        />
      )}
    </>
  );
}
