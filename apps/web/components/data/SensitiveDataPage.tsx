"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Sparkles } from "lucide-react";
import type { MinEAObject, RelationshipCreate } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { useTenancy, objectListPath } from "@/lib/tenancy";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { usePermissions } from "@/lib/use-permissions";
import { readHoldsData, toggleHoldsData, type HoldsKind } from "@/lib/ai/sensitive";
import {
  CHECKLIST_KINDS,
  CHECKLIST_QUESTION,
  buildSensitiveRows,
  checklistInitial,
  checklistPatches,
  isHoldsKind,
  listApps,
  needsChecklist,
  type SdRow,
} from "@/lib/sensitive-data";

const KIND_LABEL: Record<HoldsKind, string> = { customer: "Customer", employee: "Employee", financial: "Financial" };

/** /data/data-objects: the simple Sensitive data page by default; ?view=entities keeps the full entity list. */
export function SensitiveDataRoute({ fallback }: { fallback: React.ReactNode }) {
  const params = useSearchParams();
  return params?.get("view") === "entities" ? <>{fallback}</> : <SensitiveDataPage />;
}

export function SensitiveDataPage() {
  const catalog = useModelCatalog();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
  const queryClient = useQueryClient();
  const objects = useMemo(() => catalog.data?.objects ?? [], [catalog.data]);
  const relationships = useMemo(() => catalog.data?.relationships ?? [], [catalog.data]);
  const rows = useMemo(() => buildSensitiveRows(objects, relationships), [objects, relationships]);
  const apps = useMemo(() => listApps(objects), [objects]);
  const [checklistOpen, setChecklistOpen] = useState<boolean | null>(null);
  const showChecklist = checklistOpen ?? needsChecklist(objects);
  const [newType, setNewType] = useState("");
  const [error, setError] = useState("");

  const token = async () => {
    const value = await getToken();
    if (!value) throw new Error("Not signed in");
    return value;
  };
  const saveObject = (object: MinEAObject) => applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
  const run = async (work: () => Promise<void>) => {
    setError("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    }
  };

  const addType = () =>
    run(async () => {
      const name = newType.trim();
      if (!name) return;
      const created = await objectsApi.create(orgSlug, workspaceSlug, { type: "data_object", name, properties: { sensitive_kind: "custom" } }, await token());
      saveObject(created);
      setNewType("");
    });

  const addApp = (row: SdRow, appId: string) =>
    run(async () => {
      const app = objects.find((item) => item.id === appId);
      if (!app) return;
      const t = await token();
      if (isHoldsKind(row.kind)) {
        const current = readHoldsData(app.properties?.holds_data);
        if (current.includes(row.kind)) return;
        const holds_data = toggleHoldsData(current, row.kind);
        saveObject(await objectsApi.update(orgSlug, workspaceSlug, app.id, { properties: { ...(app.properties ?? {}), holds_data } }, t));
        return;
      }
      let entityId = row.dataObjectIds[0];
      if (!entityId) {
        const created = await objectsApi.create(orgSlug, workspaceSlug, { type: "data_object", name: row.label, properties: { sensitive_kind: row.kind } }, t);
        saveObject(created);
        entityId = created.id;
      }
      const body: RelationshipCreate = { type: "owns", from_object_id: app.id, from_type: app.type, to_object_id: entityId, to_type: "data_object" };
      const relationship = await relationshipsApi.create(orgSlug, workspaceSlug, body, t);
      applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
    });

  return (
    <div className="flex flex-col h-full" data-testid="sensitive-data-page">
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Sensitive data</h1>
          <p className="text-sm text-gray-500">Which apps hold each kind of data, and which AI can reach it.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {!showChecklist && apps.length > 0 && (
            <button type="button" className="text-amber-700 hover:underline" onClick={() => setChecklistOpen(true)}>
              Review the checklist
            </button>
          )}
          <Link className="text-gray-500 hover:underline" href={`${objectListPath(orgSlug, workspaceSlug, "data", "data-objects")}?view=entities`}>
            All data entities
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {catalog.isLoading ? (
          <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
        ) : (
          <>
            {showChecklist && apps.length > 0 && (
              <Checklist
                objects={objects}
                readOnly={!canCreate}
                onCancel={() => setChecklistOpen(false)}
                onConfirm={(answers) =>
                  run(async () => {
                    const t = await token();
                    for (const patch of checklistPatches(objects, answers)) {
                      const app = objects.find((item) => item.id === patch.id)!;
                      saveObject(await objectsApi.update(orgSlug, workspaceSlug, app.id, { properties: { ...(app.properties ?? {}), holds_data: patch.holds_data } }, t));
                    }
                    setChecklistOpen(false);
                  })
                }
              />
            )}

            <table className="w-full text-sm bg-white border border-gray-200 rounded-xl overflow-hidden" data-testid="sensitive-data-table">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 w-48">Data type</th>
                  <th className="px-4 py-2">Apps that hold it</th>
                  <th className="px-4 py-2">AI that can reach it</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-gray-100 align-top" data-testid={`sensitive-row-${row.kind}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {row.label}
                      {row.kind === "custom" && <span className="ml-2 text-xs text-gray-400">custom</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {row.apps.length === 0 && <span className="text-gray-400">None yet</span>}
                        {row.apps.map((app) => (
                          <span
                            key={app.id}
                            className={app.suggested ? "rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-gray-600" : "rounded-full bg-gray-100 px-2 py-0.5 text-gray-800"}
                            title={app.suggested ? "Suggested from the app's category; confirm it in the checklist" : undefined}
                          >
                            {app.name}
                          </span>
                        ))}
                        {canCreate && <AddApp row={row} apps={apps} onPick={(id) => void addApp(row, id)} />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {row.ai.length === 0 ? (
                        <span className="text-gray-400">None</span>
                      ) : (
                        <ul className="space-y-1">
                          {row.ai.map((ai) => (
                            <li key={`${ai.kind}:${ai.id}:${ai.name}`} className="flex items-center gap-1.5 text-gray-800">
                              {ai.kind === "agent" ? <Bot size={13} className="text-violet-600" /> : <Sparkles size={13} className="text-amber-600" />}
                              <span>{ai.name}</span>
                              <span className="text-xs text-gray-400">{ai.kind === "agent" ? ai.via : `in ${ai.via}`}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {canCreate && (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void addType();
                }}
              >
                <input
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                  placeholder="Another kind of data, e.g. Student records"
                  className="w-72 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                  data-testid="sensitive-add-type-input"
                />
                <button type="submit" disabled={!newType.trim()} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50">
                  <Plus size={14} /> Add a data type
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AddApp({ row, apps, onPick }: { row: SdRow; apps: MinEAObject[]; onPick: (id: string) => void }) {
  const held = new Set(row.apps.filter((app) => !app.suggested).map((app) => app.id));
  const options = apps.filter((app) => !held.has(app.id));
  if (options.length === 0) return null;
  return (
    <select
      aria-label={`Add an app that holds ${row.label} data`}
      className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500"
      value=""
      onChange={(event) => event.target.value && onPick(event.target.value)}
    >
      <option value="">+ App</option>
      {options.map((app) => (
        <option key={app.id} value={app.id}>
          {app.name}
        </option>
      ))}
    </select>
  );
}

function Checklist({
  objects,
  readOnly,
  onConfirm,
  onCancel,
}: {
  objects: MinEAObject[];
  readOnly: boolean;
  onConfirm: (answers: Record<string, HoldsKind[]>) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState(() => checklistInitial(objects));
  const [saving, setSaving] = useState(false);
  const apps = listApps(objects);
  const toggle = (id: string, kind: HoldsKind) =>
    setAnswers((current) => {
      const now = current[id] ?? [];
      return { ...current, [id]: now.includes(kind) ? now.filter((item) => item !== kind) : [...now, kind] };
    });
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5" data-testid="sensitive-checklist">
      <h2 className="text-base font-semibold text-gray-900">{CHECKLIST_QUESTION}</h2>
      <p className="mt-1 text-sm text-gray-600">We ticked the usual answers from each app&apos;s category. Nothing is saved until you confirm.</p>
      <table className="mt-4 text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="pr-6 py-1">App</th>
            {CHECKLIST_KINDS.map((kind) => (
              <th key={kind} className="px-3 py-1 text-center">
                {KIND_LABEL[kind]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.id}>
              <td className="pr-6 py-1 text-gray-800">{app.name}</td>
              {CHECKLIST_KINDS.map((kind) => (
                <td key={kind} className="px-3 py-1 text-center">
                  <input
                    type="checkbox"
                    aria-label={`${app.name} holds ${KIND_LABEL[kind].toLowerCase()} data`}
                    checked={(answers[app.id] ?? []).includes(kind)}
                    disabled={readOnly}
                    onChange={() => toggle(app.id, kind)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex gap-2">
        {!readOnly && (
          <button
            type="button"
            disabled={saving}
            data-testid="sensitive-checklist-confirm"
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm(answers);
              } finally {
                setSaving(false);
              }
            }}
          >
            Confirm
          </button>
        )}
        <button type="button" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" onClick={onCancel}>
          Not now
        </button>
      </div>
    </section>
  );
}
