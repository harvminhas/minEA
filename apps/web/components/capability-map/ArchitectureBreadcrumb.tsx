"use client";

import Link from "next/link";
import type { ArchitectureBreadcrumbItem } from "@/lib/architecture-breadcrumb";

export function ArchitectureBreadcrumb({
  items,
  testId,
}: {
  items: ArchitectureBreadcrumbItem[];
  testId?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-gray-400" data-testid={testId}>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <span aria-hidden>›</span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-indigo-600 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-600">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
