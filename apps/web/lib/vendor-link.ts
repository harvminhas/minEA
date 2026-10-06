import type { QueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { displayVendor } from "@/lib/model-catalog";
import { applyCatalogWrite } from "@/lib/use-model-catalog";

/** Find or create the vendor, then link the new platform or server with supplied_by. */
export async function linkSuppliedByVendor(args: {
  queryClient: QueryClient;
  orgSlug: string;
  workspaceSlug: string;
  token: string;
  source: MinEAObject;
  vendorRaw: string;
  objects: readonly { id: string; type: string; name: string }[];
}): Promise<Relationship | null> {
  const vendorName = displayVendor(args.vendorRaw);
  if (!vendorName) return null;
  const match = args.objects.find(
    (object) => object.type === "external_party" && object.name.trim().toLowerCase() === vendorName.toLowerCase()
  );
  let partyId = match?.id;
  if (!partyId) {
    const party = await objectsApi.create(
      args.orgSlug,
      args.workspaceSlug,
      { type: "external_party", name: vendorName, properties: {} },
      args.token
    );
    applyCatalogWrite(args.queryClient, args.orgSlug, args.workspaceSlug, { object: party });
    partyId = party.id;
  }
  const link = await relationshipsApi.create(
    args.orgSlug,
    args.workspaceSlug,
    {
      type: "supplied_by",
      from_object_id: args.source.id,
      from_type: args.source.type,
      to_object_id: partyId,
      to_type: "external_party",
    },
    args.token
  );
  applyCatalogWrite(args.queryClient, args.orgSlug, args.workspaceSlug, { relationship: link });
  return link;
}
