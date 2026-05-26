import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ObjectStatus, ObjectType, Layer } from "@minea/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getStatusColor(status: ObjectStatus | string | null | undefined): string {
  switch (status) {
    case "active": return "bg-green-100 text-green-800";
    case "planned": return "bg-blue-100 text-blue-800";
    case "retiring": return "bg-orange-100 text-orange-800";
    case "retired": return "bg-red-100 text-red-800";
    case "deprecated": return "bg-red-100 text-red-800";
    case "under_evaluation": return "bg-yellow-100 text-yellow-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

export function getStatusLabel(status: ObjectStatus | string | null | undefined): string {
  switch (status) {
    case "active": return "Active";
    case "planned": return "Planned";
    case "retiring": return "Retiring";
    case "retired": return "Retired";
    case "deprecated": return "Deprecated";
    case "under_evaluation": return "Evaluating";
    default: return status ?? "—";
  }
}

export function getLayerColor(layer: Layer | string): string {
  const colors: Record<string, string> = {
    strategy: "#8b5cf6",
    business: "#3b82f6",
    application: "#6366f1",
    data: "#f59e0b",
    integration: "#14b8a6",
    infrastructure: "#64748b",
    ai: "#a855f7",
  };
  return colors[layer] ?? "#64748b";
}

export function getObjectInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

export function formatCurrency(amount: number | undefined): string {
  if (!amount) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${amount}`;
}

export function getTypeLayer(type: ObjectType): Layer {
  if (["business_domain", "capability", "value_stream"].includes(type)) return "strategy";
  if (["application", "solution", "technical_capability", "agent"].includes(type)) return "application";
  if (["data_object", "data_store", "data_domain"].includes(type)) return "data";
  if (["api", "event", "integration_flow", "message_broker", "tool"].includes(type)) return "integration";
  return "infrastructure";
}
