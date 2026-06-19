import { DetailRow } from "@/components/ui/DetailPanel";
import { formatOwnershipLabel } from "@/lib/owner-fields";
import type { OwnershipFields } from "@minea/types";

type OwnableEntity = Partial<OwnershipFields> & { owner?: string | null };

export function OwnershipDetailRow({ entity }: { entity: OwnableEntity }) {
  const value = formatOwnershipLabel(
    entity.owner_team_name,
    entity.point_of_contact_name,
    entity.owner
  );
  if (!value || value === "—") return null;
  return <DetailRow label="Owner" value={value} />;
}
