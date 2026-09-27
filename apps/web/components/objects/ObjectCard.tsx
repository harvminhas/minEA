"use client";

import { type ApplicationProperties, type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { Clock } from "lucide-react";
import { CatalogCardFields } from "@/components/catalog/CatalogCardFields";
import {
  catalogOwnerLabel,
  formatCatalogAnnualCost,
  formatCatalogContractEnd,
} from "@/lib/catalog-fields";
import {
  formatUpdatedAgo,
  isSystemObject,
} from "@/lib/system-utils";
import { supportsTechDebtTab } from "@/lib/object-tech-debt";
import { systemCategoryDisplay } from "@/lib/system-category";
import {
  governanceStatusBadgeClass,
  systemGovernanceLabel,
  systemGovernanceStatus,
} from "@/lib/system-governance";
import { getObjectInitial, cn } from "@/lib/utils";

interface Props {
  object: MinEAObject;
  layerColor: string;
  onClick?: () => void;
}

const CARD_COLORS_FALLBACK = "#6366f1";

export function ObjectCard({ object, layerColor, onClick }: Props) {
  if (isSystemObject(object)) {
    return <SystemCard object={object} color={layerColor || CARD_COLORS_FALLBACK} onClick={onClick} />;
  }

  return <LegacyObjectCard object={object} layerColor={layerColor} onClick={onClick} />;
}

function SystemCard({
  object,
  color,
  onClick,
}: {
  object: MinEAObject;
  color: string;
  onClick?: () => void;
}) {
  const appProps = object.properties as ApplicationProperties;
  const categoryMeta = systemCategoryDisplay(appProps);
  const governance = systemGovernanceStatus(appProps);
  const openDebt = object.open_tech_debt_count ?? 0;
  const subtitle = categoryMeta.label || "Application";

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
    >
      {/* Header: avatar + name + vendor + status badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {getObjectInitial(object.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{object.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {governance !== "sanctioned" && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                governanceStatusBadgeClass(governance)
              )}
            >
              {systemGovernanceLabel(appProps)}
            </span>
          )}
          {openDebt > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100">
              {openDebt} debt
            </span>
          )}
        </div>
      </div>

      <CatalogCardFields
        owner={catalogOwnerLabel(object)}
        vendor={appProps.vendor?.trim() || "—"}
        annualCost={formatCatalogAnnualCost(appProps.annual_cost)}
        contractEnd={formatCatalogContractEnd(appProps.contract_renewal)}
        lifecycle={object.status}
        criticality={appProps.criticality}
      />

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated{object.updated_by_name ? ` by ${object.updated_by_name}` : ""}{" "}
          {formatUpdatedAgo(object.updated_at)}
        </span>
      </div>
    </div>
  );
}

/** Original card layout for non-system repository types. */
function LegacyObjectCard({ object, layerColor, onClick }: Props) {
  const openDebt = object.open_tech_debt_count ?? 0;
  const showDebt = supportsTechDebtTab(object.type);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all group"
    >
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: layerColor }}
          >
            {getObjectInitial(object.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{object.name}</p>
            <p className="text-xs text-gray-400">{OBJECT_TYPE_LABELS[object.type] ?? object.type}</p>
          </div>
        </div>
        {showDebt && openDebt > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-100 flex-shrink-0">
            {openDebt} debt
          </span>
        )}
      </div>
      {showDebt && (
        <p className="text-xs text-gray-500 mb-3">
          <span className="text-gray-400">Tech debt · </span>
          <span className={openDebt > 0 ? "font-medium text-red-700" : "text-gray-600"}>
            {openDebt === 0 ? "None open" : openDebt}
          </span>
        </p>
      )}
      {object.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{object.description}</p>
      )}
    </div>
  );
}
