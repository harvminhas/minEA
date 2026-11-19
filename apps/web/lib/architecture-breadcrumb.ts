export type ArchitectureBreadcrumbItem = {
  label: string;
  href?: string;
};

/** Shared Architecture record trail: Architecture › Capabilities › Domain › Capability › Activity. */
export function architectureRecordCrumbs(opts: {
  capabilitiesHref: string;
  domain?: { name: string; href?: string } | null;
  capability?: { name: string; href?: string } | null;
  activity?: { name: string } | null;
}): ArchitectureBreadcrumbItem[] {
  const items: ArchitectureBreadcrumbItem[] = [
    { label: "Architecture" },
    { label: "Capabilities", href: opts.capabilitiesHref },
  ];
  if (opts.domain?.name) {
    items.push({ label: opts.domain.name, href: opts.domain.href });
  }
  if (opts.capability?.name) {
    items.push({ label: opts.capability.name, href: opts.capability.href });
  }
  if (opts.activity?.name) {
    items.push({ label: opts.activity.name });
  }
  return items;
}
