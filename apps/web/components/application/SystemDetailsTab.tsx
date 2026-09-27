"use client";

import type { ApplicationProperties, MinEAObject, Relationship, SystemProductLink } from "@minea/types";
import { CatalogDetailFields } from "@/components/catalog/CatalogDetailFields";
import { DetailSection } from "@/components/ui/DetailPanel";
import { SystemDiagramPreview } from "@/components/application/SystemDiagramPreview";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import {
  catalogOwnerLabel,
  formatCatalogAnnualCost,
  formatCatalogContractEnd,
} from "@/lib/catalog-fields";
import { systemCategoryDisplay } from "@/lib/system-category";
import {
  governanceStatusBadgeClass,
  systemDiscovery,
  systemGovernanceLabel,
  systemGovernanceStatus,
} from "@/lib/system-governance";
import { buildDetailPropertyRows, formatPropertyDisplayValue } from "@/lib/object-property-display";
import { cn } from "@/lib/utils";

interface Props {
  object: MinEAObject;
  layerLabel: string;
  linkedCapabilities: MinEAObject[];
  productLinks: SystemProductLink[];
  productLinksLoading?: boolean;
  relationships: Relationship[];
  nameById: Record<string, string>;
  flows?: MinEAObject[];
  diagramRefreshing?: boolean;
  onExpandDiagram: () => void;
  onEdit?: () => void;
}

export function SystemDetailsTab({
  object,
  linkedCapabilities,
  productLinks,
  productLinksLoading = false,
  relationships,
  nameById,
  flows = [],
  diagramRefreshing = false,
  onExpandDiagram,
}: Props) {
  const props = object.properties as Record<string, unknown>;
  const appProps = object.properties as ApplicationProperties;
  const platformName = appProps.platform?.platform_name;
  const categoryMeta = systemCategoryDisplay(appProps);
  const governance = systemGovernanceStatus(appProps);
  const discovery = systemDiscovery(appProps);
  const hostingLabel = formatPropertyDisplayValue("hosting_model", appProps.hosting_model, object.type);
  const detailPropertyRows = buildDetailPropertyRows(props, object.type);

  const platformFromRel = relationships.some(
    (r) =>
      (r.type === "built_on" || r.type === "runs_on") &&
      r.from_object_id === object.id &&
      (r.from_type === "application" ||
        r.from_type === "solution" ||
        r.from_type === "technical_capability") &&
      r.to_type === "cloud_service"
  );

  return (
    <>
      {object.description && (
        <DetailSection title="Description">
          <p className="text-sm text-gray-700">{object.description}</p>
        </DetailSection>
      )}

      <DetailSection title="Record">
        <CatalogDetailFields
          owner={catalogOwnerLabel(object)}
          vendor={appProps.vendor?.trim() || "—"}
          annualCost={formatCatalogAnnualCost(appProps.annual_cost)}
          contractEnd={formatCatalogContractEnd(appProps.contract_renewal)}
          lifecycle={object.status}
          criticality={appProps.criticality}
        />
      </DetailSection>

      <DetailSection title="More details">
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">Governance status</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium border",
                governanceStatusBadgeClass(governance)
              )}
            >
              {systemGovernanceLabel(appProps)}
            </span>
          </div>
          {discovery && <PropertyRow label="Discovery" value={discovery} />}
          <PropertyRow label="Category" value={categoryMeta.label || "—"} />
          {categoryMeta.needsReview && categoryMeta.label && (
            <p className="text-[11px] font-medium text-amber-700 -mt-1">
              Needs review — pick a functional domain when editing
            </p>
          )}
          <PropertyRow label="Custom-built" value={categoryMeta.isCustomBuilt ? "Yes" : "No"} />
          {(platformName || platformFromRel) && (
            <PropertyRow label="Built on platform" value={platformName || "Linked platform"} />
          )}
          {hostingLabel && <PropertyRow label="Hosting model" value={hostingLabel} />}
          {detailPropertyRows.map((row) => (
            <PropertyRow key={row.key} label={row.label} value={row.value} />
          ))}
        </div>
      </DetailSection>

      <SystemDrawerSection title="Capabilities" count={linkedCapabilities.length}>
        {linkedCapabilities.length === 0 ? (
          <p className="text-sm text-gray-400">
            No capabilities linked. Edit this system to select capabilities it supports.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {linkedCapabilities.map((cap) => (
              <span
                key={cap.id}
                className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
              >
                {cap.name}
              </span>
            ))}
          </div>
        )}
      </SystemDrawerSection>

      <SystemDrawerSection title="Products" count={productLinks.length}>
        {productLinksLoading ? (
          <p className="text-sm text-gray-400">Loading products…</p>
        ) : productLinks.length === 0 ? (
          <p className="text-sm text-gray-400">
            Not included in any product. Products assign systems from the Products tab.
          </p>
        ) : (
          <ul className="space-y-2">
            {productLinks.map((link) => (
              <li
                key={link.id}
                className="py-2.5 px-3 bg-stone-50 rounded-lg text-sm text-gray-900"
              >
                {link.name}
              </li>
            ))}
          </ul>
        )}
      </SystemDrawerSection>

      <SystemDrawerSection
        title="Relationship map"
        count={
          relationships.filter(
            (r) => r.from_object_id === object.id || r.to_object_id === object.id
          ).length
        }
      >
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={diagramRefreshing} label="Updating diagram…" />
          <SystemDiagramPreview
            system={object}
            relationships={relationships}
            nameById={nameById}
            flows={flows}
            onExpand={onExpandDiagram}
            disabled={diagramRefreshing}
            emptyHint="No linked objects yet. Add connections from the Data and Object links tabs."
          />
        </div>
      </SystemDrawerSection>
    </>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}
