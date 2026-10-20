import type { IntegrationFlowProperties, MinEAObject, Relationship } from "@minea/types";
import { relationshipWords } from "@/lib/relationship-display";
import { uiTypeLabel } from "@/lib/ui-type-labels";

/**
 * Apps linked to each other through a connector record, worked out at read time:
 * API (exposes / consumes), event (publishes / subscribes), flow (source / destination),
 * integration infra (connects to) and data store / entity (owns, reads, writes, creates, updates).
 * Nothing is stored; the connector record stays the place to edit these links.
 */
export type ConnectedVia = {
  otherId: string;
  otherName: string;
  viaId: string;
  viaName: string;
  viaType: string;
  /** "API", "Event", "Flow", "Integration infra", "Data store", "Data entity". */
  viaLabel: string;
  /** How the other app takes part, in the shared relationship words ("App B consumes Orders API"). */
  sentences: string[];
};

const APP_TYPES = new Set(["application", "solution", "technical_capability"]);

/** Link types from an app to each connector type that count as "this app takes part". */
const APP_TO_CONNECTOR: Record<string, ReadonlySet<string>> = {
  api: new Set(["exposes", "consumes"]),
  event: new Set(["publishes", "subscribes"]),
  integration_flow: new Set(["uses"]),
  data_store: new Set(["owns", "reads", "writes"]),
  data_object: new Set(["owns", "creates", "reads", "updates"]),
};

type Participant = { appId: string; sentence: (appName: string, viaName: string) => string };

function relSentence(type: string, fromType: string, toType: string, appIsFrom: boolean) {
  const words = relationshipWords(type, fromType, toType);
  return (appName: string, viaName: string) =>
    appIsFrom ? words.sentence(appName, viaName) : words.sentence(viaName, appName);
}

function flowParticipants(flow: MinEAObject): Participant[] {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  const sources = new Set<string>();
  const destinations = new Set<string>();
  if (props.from?.endpoint_id) sources.add(props.from.endpoint_id);
  if (props.to?.endpoint_id) destinations.add(props.to.endpoint_id);
  for (const sys of props.sources?.systems ?? []) if (sys.system_id) sources.add(sys.system_id);
  for (const sys of props.destinations?.systems ?? []) if (sys.system_id) destinations.add(sys.system_id);
  const words = relationshipWords("sends_data_to", "application", "application");
  return [
    ...[...sources].map((appId) => ({ appId, sentence: (app: string, via: string) => `${app} ${words.forward.toLowerCase()} ${via}` })),
    ...[...destinations].map((appId) => ({ appId, sentence: (app: string, via: string) => `${app} ${words.reverse.toLowerCase()} ${via}` })),
  ];
}

export function connectedVia(
  objectId: string,
  objects: readonly MinEAObject[],
  relationships: readonly Relationship[]
): ConnectedVia[] {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const isApp = (id: string) => APP_TYPES.has(byId.get(id)?.type ?? "");
  const participants = new Map<string, Participant[]>();
  const add = (viaId: string, participant: Participant) => {
    if (!isApp(participant.appId)) return;
    const list = participants.get(viaId) ?? [];
    list.push(participant);
    participants.set(viaId, list);
  };

  for (const rel of relationships) {
    const allowed = APP_TO_CONNECTOR[rel.to_type];
    if (allowed?.has(rel.type) && byId.get(rel.to_object_id)?.type === rel.to_type) {
      add(rel.to_object_id, { appId: rel.from_object_id, sentence: relSentence(rel.type, rel.from_type, rel.to_type, true) });
    } else if (rel.type === "connects_to" && rel.from_type === "tool" && byId.get(rel.from_object_id)?.type === "tool") {
      add(rel.from_object_id, { appId: rel.to_object_id, sentence: relSentence(rel.type, rel.from_type, rel.to_type, false) });
    }
  }
  for (const object of objects) {
    if (object.type !== "integration_flow") continue;
    for (const participant of flowParticipants(object)) add(object.id, participant);
  }

  const lines = new Map<string, ConnectedVia>();
  for (const [viaId, list] of participants) {
    if (!list.some((item) => item.appId === objectId)) continue;
    const via = byId.get(viaId);
    if (!via) continue;
    const viaName = via.name?.trim() || "Untitled";
    for (const item of list) {
      if (item.appId === objectId) continue;
      const other = byId.get(item.appId);
      const otherName = other?.name?.trim() || "Untitled";
      const key = `${item.appId}:${viaId}`;
      const line =
        lines.get(key) ??
        { otherId: item.appId, otherName, viaId, viaName, viaType: via.type, viaLabel: uiTypeLabel(via.type, true), sentences: [] };
      const sentence = item.sentence(otherName, viaName);
      if (!line.sentences.includes(sentence)) line.sentences.push(sentence);
      lines.set(key, line);
    }
  }
  return [...lines.values()].sort(
    (a, b) => a.otherName.localeCompare(b.otherName) || a.viaName.localeCompare(b.viaName) || a.viaId.localeCompare(b.viaId)
  );
}

const LIST_SEGMENT: Record<string, string> = {
  api: "integration/apis",
  event: "integration/events",
  integration_flow: "integration/flows",
  tool: "integration/tools",
  data_store: "data/data-stores",
  data_object: "data/data-objects",
};

/** The connector's own list, opened on that record. */
export function connectorHref(basePath: string, viaType: string, viaId: string): string {
  const segment = LIST_SEGMENT[viaType] ?? "integration/apis";
  const view = viaType === "data_object" ? "view=entities&" : "";
  return `${basePath}/${segment}?${view}open=${encodeURIComponent(viaId)}`;
}
