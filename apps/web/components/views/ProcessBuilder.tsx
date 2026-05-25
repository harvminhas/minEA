"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, processesApi } from "@/lib/api-client";
import {
  ProcessFlowCanvas,
  newStageDraft,
  type SelectedEdge,
  type StageDraft,
} from "@/components/views/ProcessFlowCanvas";
import { AddPathDialog } from "@/components/views/AddPathDialog";
import { StageDetailPanel } from "@/components/views/StageDetailPanel";
import { DeleteStageConfirmDialog } from "@/components/views/DeleteStageConfirmDialog";
import {
  canAutosave,
  canPublish,
  defaultBranchPosition,
  edgeExists,
  edgesFromProcess,
  layoutFromIndexed,
  newEdgeDraft,
  processFromSnapshot,
  removeEdgesForStage,
  serializeProcessState,
  type EdgeDraft,
  type EdgeLabelLayoutMap,
  type NodeLayoutMap,
  type StageTransition,
} from "@/lib/process-state";
import type { Process } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  initialValues?: Process;
  onClose: () => void;
}

function toDrafts(process?: Process): StageDraft[] {
  if (!process?.stages.length) return [];
  return process.stages.map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    owner: s.owner ?? "",
    typical_duration: s.typical_duration ?? "",
    capability_ids: s.capability_ids ?? [],
  }));
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ProcessBuilder({ initialValues, onClose }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const initialDrafts = toDrafts(initialValues);
  const initialEdges = edgesFromProcess(initialValues, initialDrafts);
  const initialLayout = layoutFromIndexed(initialDrafts, initialValues?.canvas_layout, initialEdges);

  const [processId, setProcessId] = useState<string | null>(initialValues?.id ?? null);
  const [displayStatus, setDisplayStatus] = useState(initialValues?.status ?? "draft");
  const [name, setName] = useState(initialValues?.name ?? "");
  const [owner, setOwner] = useState(initialValues?.owner ?? "");
  const [stages, setStages] = useState<StageDraft[]>(() => initialDrafts);
  const [graphEdges, setGraphEdges] = useState<EdgeDraft[]>(() => initialEdges);
  const [nodeLayout, setNodeLayout] = useState<NodeLayoutMap>(() => initialLayout.nodeLayout);
  const [edgeLabelLayout, setEdgeLabelLayout] = useState<EdgeLabelLayoutMap>(
    () => initialLayout.edgeLabelLayout
  );
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null);
  const [addPathSourceId, setAddPathSourceId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    initialValues
      ? serializeProcessState(
          initialValues.name,
          initialValues.owner ?? "",
          initialDrafts,
          initialEdges,
          initialLayout.nodeLayout,
          initialLayout.edgeLabelLayout
        )
      : ""
  );
  const [publishedSnapshot, setPublishedSnapshot] = useState(() =>
    initialValues?.status === "live"
      ? serializeProcessState(
          initialValues.name,
          initialValues.owner ?? "",
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
  const processIdRef = useRef(processId);
  processIdRef.current = processId;
  const draftRef = useRef({ name, owner, stages, graphEdges, nodeLayout, edgeLabelLayout });
  draftRef.current = { name, owner, stages, graphEdges, nodeLayout, edgeLabelLayout };

  const { data: capabilities } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "capability"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "capability" }, token!);
    },
  });

  const caps = capabilities?.items ?? [];
  const selectedStage = stages.find((s) => s.id === selectedStageId) ?? null;
  const addPathSourceStage = stages.find((s) => s.id === addPathSourceId) ?? null;
  const addPathSourceIndex = addPathSourceStage ? stages.indexOf(addPathSourceStage) : -1;
  const totalCapabilities = new Set(stages.flatMap((s) => s.capability_ids)).size;

  const connectedTargetsForAddPath = useMemo(() => {
    if (!addPathSourceId) return new Set<string>();
    return new Set(graphEdges.filter((e) => e.sourceId === addPathSourceId).map((e) => e.targetId));
  }, [addPathSourceId, graphEdges]);

  const currentSnapshot = useMemo(
    () => serializeProcessState(name, owner, stages, graphEdges, nodeLayout, edgeLabelLayout),
    [name, owner, stages, graphEdges, nodeLayout, edgeLabelLayout]
  );

  const isDirty = savedSnapshot !== "" && currentSnapshot !== savedSnapshot;
  const isUnsavedNew = savedSnapshot === "" && canAutosave(name, stages);
  const hasUnsavedChanges = isDirty || isUnsavedNew;

  const differsFromPublished =
    publishedSnapshot === null || currentSnapshot !== publishedSnapshot;

  const publishReady =
    !!processId &&
    !hasUnsavedChanges &&
    differsFromPublished &&
    canPublish(name, stages);

  const addStage = useCallback(() => {
    const stage = newStageDraft(stages.length);
    setStages((prev) => {
      const next = [...prev, stage];
      if (prev.length > 0) {
        const prevStage = prev[prev.length - 1]!;
        setGraphEdges((edges) =>
          edgeExists(edges, prevStage.id, stage.id)
            ? edges
            : [...edges, newEdgeDraft(prevStage.id, stage.id)]
        );
      }
      return next;
    });
    setSelectedStageId(stage.id);
  }, [stages.length]);

  const selectStage = useCallback((id: string) => {
    setSelectedStageId(id);
    setSelectedEdge(null);
  }, []);

  const selectEdge = useCallback((edge: SelectedEdge | null) => {
    setSelectedEdge(edge);
    if (edge) setSelectedStageId(null);
  }, []);

  const updateEdgeTransition = useCallback(
    (sourceId: string, targetId: string, transition: StageTransition) => {
      setGraphEdges((prev) =>
        prev.map((edge) =>
          edge.sourceId === sourceId && edge.targetId === targetId
            ? { ...edge, transition }
            : edge
        )
      );
    },
    []
  );

  const removeStage = useCallback((id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, position: i })));
    setGraphEdges((prev) => removeEdgesForStage(prev, id));
    setNodeLayout((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setEdgeLabelLayout((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([edgeId]) => !edgeId.includes(id)))
    );
    setSelectedStageId((current) => (current === id ? null : current));
    setSelectedEdge((current) =>
      current?.sourceId === id || current?.targetId === id ? null : current
    );
    setAddPathSourceId((current) => (current === id ? null : current));
  }, []);

  const requestAddPath = useCallback((sourceId: string) => {
    setAddPathSourceId(sourceId);
    setSelectedStageId(null);
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

  const addPathToNewStage = useCallback(() => {
    if (!addPathSourceId) return;
    const stage = newStageDraft(stages.length);
    const position = defaultBranchPosition(addPathSourceId, stages, nodeLayout, graphEdges);
    setStages((prev) => [...prev, stage]);
    setNodeLayout((prev) => ({ ...prev, [stage.id]: position }));
    setGraphEdges((prev) => [...prev, newEdgeDraft(addPathSourceId, stage.id)]);
    setAddPathSourceId(null);
    setSelectedStageId(stage.id);
  }, [addPathSourceId, stages, nodeLayout, graphEdges]);

  const requestDeleteStage = useCallback((id: string, stageName: string) => {
    setPendingDelete({ id, name: stageName });
  }, []);

  const confirmDeleteStage = () => {
    if (!pendingDelete) return;
    removeStage(pendingDelete.id);
    setPendingDelete(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Tab" &&
        !e.shiftKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA" &&
        document.activeElement?.tagName !== "SELECT"
      ) {
        e.preventDefault();
        addStage();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addStage]);

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

  const updateStage = (updated: StageDraft) => {
    setStages((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const saveMutation = useMutation({
    mutationFn: async ({ status }: { status: "draft" | "live" }) => {
      const token = await getToken();
      const { name: n, owner: o, stages: s, graphEdges: ge, nodeLayout: nl, edgeLabelLayout: el } =
        draftRef.current;
      const payload = { ...processFromSnapshot(n, o, s, ge, nl, el), status };
      const id = processIdRef.current;
      if (id) {
        return processesApi.update(orgSlug, workspaceSlug, id, payload, token!);
      }
      return processesApi.create(orgSlug, workspaceSlug, payload, token!);
    },
    onSuccess: (saved, { status }) => {
      const newDrafts = toDrafts(saved);
      const newEdges = edgesFromProcess(saved, newDrafts);
      const savedLayout = layoutFromIndexed(newDrafts, saved.canvas_layout, newEdges);
      setProcessId(saved.id);
      processIdRef.current = saved.id;
      setName(saved.name);
      setOwner(saved.owner ?? "");
      setDisplayStatus(saved.status);
      setStages(newDrafts);
      setGraphEdges(newEdges);
      setNodeLayout(savedLayout.nodeLayout);
      setEdgeLabelLayout(savedLayout.edgeLabelLayout);
      setSelectedStageId((current) => {
        if (!current) return null;
        const idx = stages.findIndex((s) => s.id === current);
        return idx >= 0 ? newDrafts[idx]?.id ?? null : null;
      });
      const snapshot = serializeProcessState(
        saved.name,
        saved.owner ?? "",
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
      queryClient.invalidateQueries({ queryKey: ["processes", orgSlug, workspaceSlug] });
    },
    onError: (err) => {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Could not save draft");
    },
  });

  useEffect(() => {
    if (!canAutosave(name, stages)) return;
    if (savedSnapshot !== "" && currentSnapshot === savedSnapshot) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      if (savingRef.current) return;
      if (!canAutosave(name, stages)) return;
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
  }, [name, owner, stages, graphEdges, nodeLayout, edgeLabelLayout, currentSnapshot, savedSnapshot]);

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
          : processId
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
              placeholder="Process name, e.g. Merchant onboarding"
              className="text-xl font-semibold text-gray-900 w-full border border-transparent hover:border-gray-200 focus:border-indigo-300 rounded-md px-2 -mx-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-300"
            />
            <p className="text-sm text-gray-400 mt-0.5 px-2 -mx-2">
              Define a process as an ordered sequence of stages
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3 px-2 -mx-2">
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Owner: Payments team"
                className="text-xs border border-gray-200 rounded-full px-3 py-1 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-auto min-w-[160px]"
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
              {totalCapabilities > 0 && (
                <span className="inline-flex items-center gap-1 text-xs border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-full px-3 py-1">
                  <Sparkles size={11} />
                  Inferred: {stages.length} stage{stages.length === 1 ? "" : "s"} ·{" "}
                  {totalCapabilities} capabilit{totalCapabilities === 1 ? "y" : "ies"}
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
            <button
              type="button"
              onClick={handlePublish}
              disabled={!publishReady || saveMutation.isPending}
              className="bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-md px-4 py-2 text-sm font-medium"
              title={
                !processId
                  ? "Wait for draft to save"
                  : hasUnsavedChanges
                    ? "Wait for unsaved changes to sync"
                    : !differsFromPublished
                      ? "No changes since last publish"
                      : !canPublish(name, stages)
                        ? "Add a name and at least one named stage"
                        : undefined
              }
            >
              {saveMutation.isPending ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>

        {saveError && (
          <p className="px-6 py-2 text-xs text-red-600 border-b border-red-50 bg-red-50">{saveError}</p>
        )}

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 min-w-0 relative">
            {stages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center bg-[#fafafa]">
                <button
                  type="button"
                  onClick={addStage}
                  className={cn(
                    "rounded-xl border-2 border-dashed border-gray-300 px-10 py-8",
                    "hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors text-center"
                  )}
                >
                  <p className="text-sm font-medium text-gray-600 mb-1">Add your first stage</p>
                  <p className="text-xs text-gray-400">Click here or press Tab</p>
                </button>
              </div>
            ) : (
              <ProcessFlowCanvas
                stages={stages}
                graphEdges={graphEdges}
                nodeLayout={nodeLayout}
                edgeLabelLayout={edgeLabelLayout}
                selectedStageId={selectedStageId}
                selectedEdge={selectedEdge}
                onSelectStage={selectStage}
                onSelectEdge={selectEdge}
                onUpdateEdgeTransition={updateEdgeTransition}
                onLayoutChange={handleLayoutChange}
                onResetLayout={resetLayout}
                onAddStage={addStage}
                onRequestAddPath={requestAddPath}
                onRequestDeleteStage={requestDeleteStage}
              />
            )}
          </div>

          {selectedStage && (
            <StageDetailPanel
              stage={selectedStage}
              capabilities={caps}
              onSave={updateStage}
              onRequestDelete={requestDeleteStage}
              onClose={() => setSelectedStageId(null)}
            />
          )}
        </div>
      </div>

      {pendingDelete && (
        <DeleteStageConfirmDialog
          stageName={pendingDelete.name}
          onConfirm={confirmDeleteStage}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {addPathSourceStage && addPathSourceIndex >= 0 && (
        <AddPathDialog
          sourceStage={addPathSourceStage}
          sourceIndex={addPathSourceIndex}
          stages={stages}
          connectedTargetIds={connectedTargetsForAddPath}
          onSelectExisting={addPathToExisting}
          onCreateNew={addPathToNewStage}
          onCancel={() => setAddPathSourceId(null)}
        />
      )}
    </>
  );
}
