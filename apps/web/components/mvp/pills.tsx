import { cn } from "@/lib/utils";

export function lifecycleClass(label: string): string {
  switch (label) {
    case "Active":
      return "bg-emerald-50 text-emerald-700";
    case "Pilot":
      return "bg-[#e0f2fe] text-[#0369a1]";
    case "Retiring":
      return "bg-orange-50 text-orange-700";
    case "End of life":
      return "bg-red-50 text-red-700";
    default:
      return "bg-stone-100 text-stone-600";
  }
}

export function criticalityClass(label: string): string {
  switch (label) {
    case "Critical":
      return "bg-red-50 text-red-700";
    case "High":
      return "bg-orange-50 text-orange-800";
    case "Medium":
      return "bg-amber-50 text-amber-800";
    case "Low":
      return "bg-emerald-50 text-emerald-700";
    default:
      return "bg-stone-100 text-stone-500";
  }
}

export function Pill({ label, tone }: { label: string; tone: "lifecycle" | "criticality" }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "lifecycle" ? lifecycleClass(label) : criticalityClass(label)
      )}
    >
      {label}
    </span>
  );
}

export function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="rounded-md bg-[#fff7ed] px-2 py-0.5 text-[12px] font-medium text-[#c2410c] hover:bg-[#ffedd5]"
    >
      + {label}
    </button>
  );
}
