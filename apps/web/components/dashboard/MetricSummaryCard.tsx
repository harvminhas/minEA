import { cn } from "@/lib/utils";
import type { MetricCardVariant } from "@/lib/workspace-dashboard";

export function MetricSummaryCard({
  label,
  value,
  subtext,
  variant = "default",
  onClick,
  selected = false,
}: {
  label: string;
  value: number | string;
  subtext: string;
  variant?: MetricCardVariant;
  onClick?: () => void;
  selected?: boolean;
}) {
  const className = cn(
    "relative rounded-2xl border bg-white px-5 py-4 min-w-0 overflow-hidden text-left w-full transition-colors",
    variant === "warn" && "border-amber-200/70",
    variant === "success" && "border-emerald-200/70",
    variant === "default" && "border-gray-200/80",
    onClick && "cursor-pointer hover:border-indigo-200/80 hover:bg-gray-50/50",
    selected && "border-indigo-300 ring-1 ring-indigo-200 bg-indigo-50/40"
  );

  const inner = (
    <>
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-[2px]",
          variant === "warn" && "bg-amber-300/60",
          variant === "success" && "bg-emerald-300/60",
          variant === "default" && "bg-gray-200/80"
        )}
      />
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{label}</p>
      <p
        className={cn(
          "text-4xl font-semibold tabular-nums leading-none",
          variant === "warn" && "text-amber-700",
          variant === "success" && "text-emerald-700",
          variant === "default" && "text-gray-900"
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          "text-xs mt-2",
          variant === "warn" && "text-amber-600/80",
          variant === "success" && "text-emerald-600/80",
          variant === "default" && "text-gray-400"
        )}
      >
        {subtext}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}
