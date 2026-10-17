"use client";

import { useState, useCallback } from "react";

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  /** A link under the text (e.g. "Upgrade to Starter"). */
  action?: { label: string; href: string };
  /** ms before it hides itself (default 4000). */
  duration?: number;
  /** Replaces a toast with the same tag instead of stacking (e.g. one item-limit toast at a time). */
  tag?: string;
}

let globalToasts: Toast[] = [];
let listeners: Array<(toasts: Toast[]) => void> = [];

function notify() {
  listeners.forEach((l) => l([...globalToasts]));
}

export function toast({ title, description, variant, action, duration = 4000, tag }: Omit<Toast, "id">) {
  const id = Math.random().toString(36).slice(2);
  const kept = tag ? globalToasts.filter((t) => t.tag !== tag) : globalToasts;
  globalToasts = [...kept, { id, title, description, variant, action, duration, tag }];
  notify();
  setTimeout(() => {
    globalToasts = globalToasts.filter((t) => t.id !== id);
    notify();
  }, duration);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const subscribe = useCallback((listener: (t: Toast[]) => void) => {
    listeners.push(listener);
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }, []);

  useState(() => {
    const unsub = subscribe(setToasts);
    return unsub;
  });

  const dismiss = useCallback((id: string) => {
    globalToasts = globalToasts.filter((t) => t.id !== id);
    notify();
  }, []);

  return { toasts, dismiss };
}
