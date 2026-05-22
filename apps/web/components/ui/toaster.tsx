"use client";

import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[100] min-w-[280px]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg px-4 py-3 text-sm shadow-lg border",
            toast.variant === "destructive"
              ? "bg-red-600 text-white border-red-700"
              : "bg-white text-gray-900 border-gray-200"
          )}
        >
          <div>
            {toast.title && <p className="font-semibold">{toast.title}</p>}
            {toast.description && <p className="opacity-80">{toast.description}</p>}
          </div>
          <button onClick={() => dismiss(toast.id)} className="flex-shrink-0 opacity-60 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
