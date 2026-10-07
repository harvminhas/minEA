import type { MinEAObject } from "@minea/types";
import { compareUpdatedAt } from "@/lib/updated-at";
import type { FeaturePatch } from "./features";

/**
 * One lane per record for ai_features / cost_lines saves. Both keys are saved as whole arrays, so two
 * saves in flight at once can undo each other. The lane sends them one at a time, in click order, and
 * builds each patch from the server's last answer (not from the cache, which a late catalog fetch can
 * roll back). The cache shows that answer with every waiting click applied on top.
 */

export type FeatureBuild = (current: MinEAObject) => FeaturePatch;

export type FeatureDeps = {
  /** The freshest cached copy of the record. */
  read: () => MinEAObject | undefined;
  /** Writes a copy of the record into the cache. */
  write: (object: MinEAObject) => void;
  send: (patch: FeaturePatch) => Promise<MinEAObject>;
  onError: (message: string) => void;
  /** True when no other editor has a save waiting on this record (the whole answer can go into the cache). */
  alone?: () => boolean;
};

type Op = { build: FeatureBuild; deps: FeatureDeps; done: () => void };
type Lane = { base: MinEAObject | null; confirmed: MinEAObject | null; ops: Op[]; running: boolean };

const AI_KEYS = ["ai_features", "cost_lines"] as const;
const lanes = new Map<string, Lane>();

function newest(cached: MinEAObject | undefined, confirmed: MinEAObject | null): MinEAObject | null {
  if (!cached) return confirmed;
  if (!confirmed) return cached;
  return compareUpdatedAt(confirmed.updated_at, cached.updated_at) === 1 ? confirmed : cached;
}

function withAiKeys(target: MinEAObject, source: MinEAObject): MinEAObject {
  const properties: Record<string, unknown> = { ...(target.properties ?? {}) };
  const from = (source.properties ?? {}) as Record<string, unknown>;
  for (const key of AI_KEYS) {
    if (key in from) properties[key] = from[key];
    else delete properties[key];
  }
  return { ...target, properties } as MinEAObject;
}

function apply(object: MinEAObject, patch: FeaturePatch): MinEAObject {
  return { ...object, properties: { ...(object.properties ?? {}), ...patch.properties } } as MinEAObject;
}

/** Server answer + every waiting click, written over the cached copy (other fields stay as the cache has them). */
function show(lane: Lane, deps: FeatureDeps) {
  if (!lane.base) return;
  let preview = lane.base;
  for (const op of lane.ops) {
    try {
      preview = apply(preview, op.build(preview));
    } catch {
      // Reported when it runs.
    }
  }
  deps.write(withAiKeys(deps.read() ?? lane.base, preview));
}

async function drain(lane: Lane) {
  lane.running = true;
  while (lane.ops.length > 0) {
    const op = lane.ops[0];
    const base = lane.base;
    let saved: MinEAObject | null = null;
    if (base) {
      let patch: FeaturePatch | null = null;
      try {
        patch = op.build(base);
      } catch (err) {
        op.deps.onError(err instanceof Error ? err.message : "Could not save");
      }
      if (patch) {
        try {
          saved = await op.deps.send(patch);
          lane.base = saved;
          lane.confirmed = saved;
        } catch (err) {
          op.deps.onError(`Couldn't save: ${err instanceof Error ? err.message : "Could not save"}`);
        }
      }
    }
    lane.ops.shift();
    if (lane.ops.length > 0) show(lane, op.deps);
    else if (saved && (op.deps.alone?.() ?? true)) op.deps.write(saved);
    else if (lane.base) op.deps.write(withAiKeys(op.deps.read() ?? lane.base, lane.base));
    op.done();
  }
  lane.running = false;
}

/** Queues one AI save for this record. Resolves once it has been sent (or dropped with an error). */
export function enqueueFeatureSave(laneKey: string, build: FeatureBuild, deps: FeatureDeps): Promise<void> {
  let lane = lanes.get(laneKey);
  if (!lane) {
    lane = { base: null, confirmed: null, ops: [], running: false };
    lanes.set(laneKey, lane);
  }
  const current = lane;
  if (!current.running) current.base = newest(deps.read(), current.confirmed);
  return new Promise<void>((resolve) => {
    current.ops.push({ build, deps, done: resolve });
    show(current, deps);
    if (!current.running) void drain(current);
  });
}

/** Test hook: forget every lane. */
export function resetFeatureLanes() {
  lanes.clear();
}
