import { cn } from "@/lib/utils";

export function MetricSummaryCard({
  label,
  value,
  subtext,
  variant = "default",
}: {
  label: string;
  value: number | string;
  subtext: string;
  variant?: "default" | "warn";
}) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-white px-5 py-4 min-w-0 overflow-hidden",
        variant === "warn" ? "border-amber-200/70" : "border-gray-200/80"
      )}
    >
      {/* subtle top accent stripe */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-[2px]",
          variant === "warn" ? "bg-amber-300/60" : "bg-gray-200/80"
        )}
      />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{label}</p>
      <p
        className={cn(
          "text-4xl font-semibold tabular-nums leading-none",
          variant === "warn" ? "text-amber-700" : "text-gray-900"
        )}
      >
        {value}
      </p>
      <p className={cn("text-xs mt-2", variant === "warn" ? "text-amber-600/80" : "text-gray-400")}>
        {subtext}
      </p>
    </div>
  );
}
