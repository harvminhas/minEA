import { countLabel } from "@/lib/labels";
import type { AiLandscape } from "./landscape";

/** Ask home's AI card, read off the AI landscape result (same `places` as the report strip). */
export type AiHomeCard = {
  /** "AI in 3 places · 2 agents running" or "AI may be on in 2 apps". */
  text: string;
  /** "Review" when only catalog suggestions exist. */
  action: string | null;
  /** "1 high flag", styled like the report's High pill. */
  flag: string | null;
};

/** Agent status column values: Live and Piloting (AGENT_STATUS_OPTIONS). */
const RUNNING = "active";
const PILOTING = "under_evaluation";

export function aiHomeCard(result: Pick<AiLandscape, "places" | "agents" | "highFlags" | "unreviewed">): AiHomeCard | null {
  if (result.places === 0) {
    const hosts = new Set(result.unreviewed.map((row) => row.hostId)).size;
    return hosts ? { text: `AI may be on in ${countLabel(hosts, "app", "apps")}`, action: "Review", flag: null } : null;
  }
  const running = result.agents.filter((agent) => agent.status === RUNNING).length;
  const piloting = result.agents.filter((agent) => agent.status === PILOTING).length;
  const parts = [`AI in ${countLabel(result.places, "place", "places")}`];
  if (running) parts.push(`${countLabel(running, "agent", "agents")} running`);
  if (piloting) parts.push(`${piloting} piloting`);
  return { text: parts.join(" · "), action: null, flag: result.highFlags ? countLabel(result.highFlags, "high flag", "high flags") : null };
}

/** The card as one line of text, the way it reads on screen. */
export function aiHomeCardLabel(card: AiHomeCard): string {
  return [card.text, card.action, card.flag].filter(Boolean).join(" · ");
}
