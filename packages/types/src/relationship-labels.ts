import type { RelationshipType } from "./index";

export type RelationshipLabel = {
  forward: string;
  reverse: string;
  sentence: (from: string, to: string) => string;
};

function label(forward: string, reverse: string, sentence: (from: string, to: string) => string): RelationshipLabel {
  return { forward, reverse, sentence };
}

/**
 * One label for every relationship type. Forward is the stored source → target.
 * Reverse is the same edge read from the target. Both sets are unique.
 */
export const RELATIONSHIP_LABELS: Record<RelationshipType, RelationshipLabel> = {
  depends_on: label("Depends on", "Needed by", (from, to) => `${from} depends on ${to}`),
  part_of: label("Part of", "Includes", (from, to) => `${from} is part of ${to}`),
  calls: label("Calls", "Called by", (from, to) => `${from} calls ${to}`),
  uses: label("Makes use of", "Made use of", (from, to) => `${from} makes use of ${to}`),
  contains: label("Contains", "Stored in", (from, to) => `${from} contains ${to}`),
  connects: label("Uses", "Used by flow", (from, to) => `${from} uses ${to}`),
  routes: label("Routes to", "Routed from", (from, to) => `${from} routes to ${to}`),
  hosts: label("Gateway for", "Behind gateway", (from, to) => `${from} is gateway for ${to}`),
  carries: label("Carries", "Carried by", (from, to) => `${from} carries ${to}`),
  supported_by: label("Supported by", "Supports", (from, to) => `${from} is supported by ${to}`),
  exposes: label("Exposes", "Exposed by", (from, to) => `${from} exposes ${to}`),
  publishes: label("Publishes", "Published by", (from, to) => `${from} publishes ${to}`),
  consumes: label("Consumes", "Consumed by", (from, to) => `${from} consumes ${to}`),
  subscribes: label("Subscribes to", "Subscribed by", (from, to) => `${from} subscribes to ${to}`),
  reads: label("Reads from", "Read by", (from, to) => `${from} reads from ${to}`),
  writes: label("Writes to", "Written by", (from, to) => `${from} writes to ${to}`),
  creates: label("Creates", "Created by", (from, to) => `${from} creates ${to}`),
  updates: label("Updates", "Updated by", (from, to) => `${from} updates ${to}`),
  owns: label("Owns", "Owned by", (from, to) => `${from} owns ${to}`),
  belongs_to: label("Belongs to", "Contains entity/store", (from, to) => `${from} belongs to ${to}`),
  runs_on: label("Runs on", "Runs", (from, to) => `${from} runs on ${to}`),
  built_on: label("Built on", "Platform for", (from, to) => `${from} is built on ${to}`),
  affects: label("Affects", "Affected by", (from, to) => `${from} affects ${to}`),
  resolves: label("Resolves", "Resolved by", (from, to) => `${from} resolves ${to}`),
  replaces: label("Replaces", "Replaced by", (from, to) => `${from} replaces ${to}`),
  // TODO: real AI models need their own type later. Do not rename the stored "model" type.
  uses_model: label("Runs on server", "Server for agent", (from, to) => `${from} runs on server ${to}`),
  can_call: label("Can call", "Callable by", (from, to) => `${from} can call ${to}`),
  supports: label("Provides support", "Receives support", (from, to) => `${from} provides support for ${to}`),
  escalates_to: label("Escalates to", "Escalated from", (from, to) => `${from} escalates to ${to}`),
  accesses: label("Accesses", "Accessed by", (from, to) => `${from} accesses ${to}`),
  connects_to: label("Connects to", "Connected through", (from, to) => `${from} connects to ${to}`),
  located_at: label("Located at", "Location of", (from, to) => `${from} is located at ${to}`),
  supplied_by: label("Supplied by", "Supplies", (from, to) => `${from} is supplied by ${to}`),
  sends_data_to: label("Sends data to", "Gets data from", (from, to) => `${from} sends data to ${to}`),
};
