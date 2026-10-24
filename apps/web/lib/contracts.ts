import type { MinEAObject } from "@minea/types";

/**
 * Vendor contracts (API: /contracts, migration 058). A contract covers one or more apps; its annual
 * cost is split across them (by seats when every covered app has seats, otherwise evenly) and replaces
 * each covered app's recurring vendor cost lines, so every total built from app properties (vendor
 * spend, renewals, idle licences, overlaps, Ask) counts a contract once. Apps with no contract, or
 * whose contracts carry no cost, keep their own fields. Mirrors apps/api/app/services/contracts.py.
 */
export type ContractItem = { object_id: string; seats: number | null; in_use: number | null };

export type VendorContract = {
  id: string;
  vendor_id: string | null;
  vendor_name: string | null;
  name: string;
  annual_cost_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  notice_days: number | null;
  auto_renew: boolean;
  owner_contact_id: string | null;
  document_url: string | null;
  items: ContractItem[];
};

export type ContractInput = Partial<Omit<VendorContract, "id" | "vendor_name" | "items">> & {
  items?: { object_id: string; seats?: number | null; in_use?: number | null }[];
};

export function contractShares(contract: Pick<VendorContract, "annual_cost_cents" | "items">): Map<string, number> {
  const items = (contract.items ?? []).filter((item) => item.object_id);
  const shares = new Map<string, number>();
  if (!items.length || contract.annual_cost_cents == null) return shares;
  const total = Math.round(contract.annual_cost_cents);
  const bySeats = items.every((item) => typeof item.seats === "number" && item.seats > 0);
  const weights = items.map((item) => (bySeats ? (item.seats as number) : 1));
  const whole = weights.reduce((a, b) => a + b, 0);
  let given = 0;
  items.forEach((item, index) => {
    const part = index === items.length - 1 ? total - given : Math.floor((total * weights[index]) / whole);
    given += part;
    shares.set(item.object_id, (shares.get(item.object_id) ?? 0) + part);
  });
  return shares;
}

export function coveringByObject(contracts: readonly VendorContract[]): Map<string, VendorContract[]> {
  const out = new Map<string, VendorContract[]>();
  for (const contract of contracts) {
    for (const item of contract.items ?? []) {
      const list = out.get(item.object_id) ?? [];
      if (!list.includes(contract)) list.push(contract);
      out.set(item.object_id, list);
    }
  }
  return out;
}

type Props = Record<string, unknown>;

export function effectiveProperties(properties: Props | null | undefined, covering: readonly VendorContract[], objectId: string): Props {
  const props: Props = { ...(properties ?? {}) };
  if (!covering.length) return props;
  const costed = covering.filter((c) => c.annual_cost_cents != null);
  if (costed.length) {
    const own = Array.isArray(props.cost_lines) ? (props.cost_lines as Props[]) : [];
    const kept = own.filter((line) => line && typeof line === "object" && (line.type === "internal_estimate" || line.frequency === "one_time"));
    let total = 0;
    const lines = costed.map((contract) => {
      const cents = contractShares(contract).get(objectId) ?? 0;
      total += cents;
      return {
        id: `contract-${contract.id}`,
        type: "subscription",
        frequency: "annual",
        source: "invoice",
        vendor: contract.vendor_name ?? "",
        amount_cents: cents,
        calculation: { kind: "flat" },
        contract_id: contract.id,
      };
    });
    props.cost_lines = [...lines, ...kept];
    props.annual_cost = total / 100;
  }
  const mine = covering.flatMap((c) => c.items.filter((item) => item.object_id === objectId));
  const seats = mine.map((item) => item.seats).filter((n): n is number => typeof n === "number");
  const inUse = mine.map((item) => item.in_use).filter((n): n is number => typeof n === "number");
  if (seats.length) props.licence_count = seats.reduce((a, b) => a + b, 0);
  if (inUse.length) props.licences_in_use = inUse.reduce((a, b) => a + b, 0);
  const ends = covering.map((c) => c.end_date).filter((d): d is string => Boolean(d)).sort();
  if (ends.length) props.contract_renewal = ends[0];
  return props;
}

/** Objects with contracts applied. Returns the same array when no contract covers anything. */
export function effectiveObjects(objects: MinEAObject[], contracts: readonly VendorContract[]): MinEAObject[] {
  if (!contracts.length) return objects;
  const covering = coveringByObject(contracts);
  if (!covering.size) return objects;
  return objects.map((object) => {
    const list = covering.get(object.id);
    if (!list) return object;
    return { ...object, properties: effectiveProperties(object.properties as Props, list, object.id) } as MinEAObject;
  });
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToday(now: Date): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const DAY = 86_400_000;

export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type RenewalInfo = { days: number; end: Date; noticeBy: Date | null; noticeDays: number | null; urgent: boolean; text: string };

/** "Renews in N days · notice by DATE" for a contract with an end date. */
export function renewalInfo(contract: Pick<VendorContract, "end_date" | "notice_days" | "auto_renew">, now = new Date()): RenewalInfo | null {
  const end = parseDay(contract.end_date);
  if (!end) return null;
  const today = utcToday(now);
  const days = Math.round((end.getTime() - today.getTime()) / DAY);
  const noticeBy = contract.notice_days != null ? new Date(end.getTime() - contract.notice_days * DAY) : null;
  const verb = contract.auto_renew ? "Renews" : "Ends";
  const head = days < 0 ? `${contract.auto_renew ? "Renewed" : "Ended"} ${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? `${verb} today` : `${verb} in ${days} day${days === 1 ? "" : "s"}`;
  const tail = noticeBy && days >= 0 ? ` · notice by ${formatDay(noticeBy)}` : "";
  const urgent = days >= 0 && (noticeBy ? noticeBy.getTime() - today.getTime() <= 30 * DAY : days <= 90);
  return { days, end, noticeBy, noticeDays: contract.notice_days, urgent, text: head + tail };
}

/** The earliest upcoming end date across contracts (today or later). */
export function nextRenewal(contracts: readonly VendorContract[], now = new Date()): { contract: VendorContract; info: RenewalInfo } | null {
  let best: { contract: VendorContract; info: RenewalInfo } | null = null;
  for (const contract of contracts) {
    const info = renewalInfo(contract, now);
    if (!info || info.days < 0) continue;
    if (!best || info.days < best.info.days) best = { contract, info };
  }
  return best;
}

export const DRAFT_CONTRACT_ID = "draft";

/** What the drawer shows the instant '+ Contract' is clicked, while the create is still on its way. */
export function draftContract(vendorName: string | null, vendorId: string | null = null): VendorContract {
  const name = vendorName?.trim() ? `${vendorName.trim()} contract` : "New contract";
  return {
    id: DRAFT_CONTRACT_ID, vendor_id: vendorId, vendor_name: vendorName, name, annual_cost_cents: null, start_date: null, end_date: null,
    notice_days: null, auto_renew: false, owner_contact_id: null, document_url: null, items: [],
  };
}

export function isDraftContract(contract: Pick<VendorContract, "id">): boolean {
  return contract.id === DRAFT_CONTRACT_ID;
}
