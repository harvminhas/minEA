"use client";

import {
  BarChart3,
  Briefcase,
  Calculator,
  Cloud,
  Code,
  CreditCard,
  HeartPulse,
  Landmark,
  Layers,
  Megaphone,
  Scale,
  Server,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Store,
  Stethoscope,
  Tag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  cloud: Cloud,
  store: Store,
  landmark: Landmark,
  "shopping-cart": ShoppingCart,
  "shield-check": ShieldCheck,
  "heart-pulse": HeartPulse,
};

export const DOMAIN_ICONS: Record<string, LucideIcon> = {
  users: Users,
  box: Layers,
  "credit-card": CreditCard,
  code: Code,
  "trending-up": TrendingUp,
  calculator: Calculator,
  server: Server,
  briefcase: Briefcase,
  shield: Shield,
  scale: Scale,
  megaphone: Megaphone,
  settings: Server,
  wallet: Wallet,
  "hand-coins": CreditCard,
  "alert-triangle": Shield,
  tag: Tag,
  package: Briefcase,
  truck: Truck,
  "map-pin": Store,
  "clipboard-check": Briefcase,
  "file-text": Briefcase,
  "heart-pulse": HeartPulse,
  "bar-chart": BarChart3,
  stethoscope: Stethoscope,
  pill: HeartPulse,
  "user-cog": Users,
  activity: BarChart3,
};

export function templateIcon(id: string): LucideIcon {
  return TEMPLATE_ICONS[id] ?? Layers;
}

export function domainIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Layers;
  return DOMAIN_ICONS[name] ?? Layers;
}

const DOMAIN_ICON_PALETTE = [
  { bg: "bg-emerald-100", text: "text-emerald-600" },
  { bg: "bg-violet-100", text: "text-violet-600" },
  { bg: "bg-amber-100", text: "text-amber-600" },
  { bg: "bg-sky-100", text: "text-sky-600" },
  { bg: "bg-rose-100", text: "text-rose-600" },
  { bg: "bg-indigo-100", text: "text-indigo-600" },
] as const;

export function domainIconStyle(domainId: string): { bg: string; text: string } {
  const index =
    domainId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    DOMAIN_ICON_PALETTE.length;
  return DOMAIN_ICON_PALETTE[index];
}
