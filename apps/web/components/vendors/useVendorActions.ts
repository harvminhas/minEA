"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, PeopleContact } from "@minea/types";
import { contractsApi, objectsApi, peopleApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { ContractInput, VendorContract } from "@/lib/contracts";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, applyContractWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { displayVendorName, sameVendor } from "@/lib/vendors";

/** Every create a vendor screen needs, inline: vendor, app (linked supplied_by), contract, items. */
export function useVendorActions() {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const catalog = useModelCatalog();
  const token = async () => {
    const t = await getToken();
    if (!t || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
    return t;
  };
  const objects = () => catalog.data?.objects ?? [];
  const relationships = () => catalog.data?.relationships ?? [];

  const ensureVendor = async (name: string): Promise<MinEAObject> => {
    const wanted = displayVendorName(name);
    const found = objects().find((o) => o.type === "external_party" && sameVendor(o.name, wanted));
    if (found) return found;
    const party = await objectsApi.create(orgSlug!, workspaceSlug!, { type: "external_party", name: wanted, properties: {} }, await token());
    applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: party });
    return party;
  };

  const link = async (app: MinEAObject, party: MinEAObject) => {
    const t = await token();
    const exists = relationships().some((r) => r.type === "supplied_by" && r.from_object_id === app.id && r.to_object_id === party.id);
    if (!exists) {
      const rel = await relationshipsApi.create(
        orgSlug!, workspaceSlug!,
        { type: "supplied_by", from_object_id: app.id, from_type: app.type, to_object_id: party.id, to_type: "external_party" },
        t
      );
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { relationship: rel });
    }
    const props = (app.properties ?? {}) as Record<string, unknown>;
    if (!String(props.vendor ?? "").trim()) {
      const saved = await objectsApi.update(orgSlug!, workspaceSlug!, app.id, { properties: { ...props, vendor: party.name } }, t);
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: saved });
    }
  };

  /** Create an app supplied by the vendor (catalog '+ Add', or typing a new app name anywhere). */
  const createApp = async (name: string, party: MinEAObject | null, extra: Record<string, unknown> = {}): Promise<MinEAObject> => {
    const app = await objectsApi.create(
      orgSlug!, workspaceSlug!,
      { type: "application", name: name.trim(), properties: { ...(party ? { vendor: party.name } : {}), ...extra } },
      await token()
    );
    applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: app });
    if (party) await link(app, party);
    return app;
  };

  const contract = {
    create: async (body: ContractInput) => {
      const made = await contractsApi.create(orgSlug!, workspaceSlug!, body, await token());
      applyContractWrite(queryClient, orgSlug!, workspaceSlug!, { contract: made });
      return made;
    },
    update: async (id: string, body: ContractInput) => {
      const saved = await contractsApi.update(orgSlug!, workspaceSlug!, id, body, await token());
      applyContractWrite(queryClient, orgSlug!, workspaceSlug!, { contract: saved });
      return saved;
    },
    setItem: async (id: string, objectId: string, body: { seats?: number | null; in_use?: number | null }) => {
      const saved = await contractsApi.setItem(orgSlug!, workspaceSlug!, id, objectId, body, await token());
      applyContractWrite(queryClient, orgSlug!, workspaceSlug!, { contract: saved });
      return saved;
    },
    removeItem: async (id: string, objectId: string) => {
      const saved = await contractsApi.removeItem(orgSlug!, workspaceSlug!, id, objectId, await token());
      applyContractWrite(queryClient, orgSlug!, workspaceSlug!, { contract: saved });
      return saved;
    },
    remove: async (item: VendorContract) => {
      await contractsApi.remove(orgSlug!, workspaceSlug!, item.id, await token());
      applyContractWrite(queryClient, orgSlug!, workspaceSlug!, { removeId: item.id });
    },
  };

  const saveVendor = async (party: MinEAObject, properties: Record<string, unknown>) => {
    const saved = await objectsApi.update(orgSlug!, workspaceSlug!, party.id, { properties: { ...(party.properties ?? {}), ...properties } }, await token());
    applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: saved });
    return saved;
  };

  return { ensureVendor, link, createApp, contract, saveVendor };
}

export function usePeopleContacts(): PeopleContact[] {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const query = useQuery({
    queryKey: ["people-contacts", orgSlug, workspaceSlug, "vendors"],
    enabled: Boolean(orgSlug && workspaceSlug),
    // Opening a contract drawer mounts another reader; don't refetch the people list each time.
    staleTime: 5 * 60_000,
    queryFn: async () => (await peopleApi.listContacts(orgSlug!, workspaceSlug!, (await getToken())!)).items,
  });
  return query.data ?? [];
}
