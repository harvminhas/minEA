import type { CapabilityMapCapability } from "@minea/types";

export function domainDeleteMessage(capabilityCount: number) {
  const noun = capabilityCount === 1 ? "capability" : "capabilities";
  return (
    <>
      This will delete the domain and all{" "}
      <span className="font-medium text-gray-700">{capabilityCount}</span> {noun} inside it.
      System mappings, product links, and other relationships tied to those capabilities will be
      removed. This cannot be undone.
    </>
  );
}

export function capabilityDeleteMessage(capability: CapabilityMapCapability) {
  const systems = capability.system_count ?? 0;
  const products = capability.product_count ?? 0;

  if (systems === 0 && products === 0) {
    return (
      <>
        <span className="font-medium text-gray-700">{capability.name}</span> has no system mappings
        or product links. Deleting it will permanently remove this capability. This cannot be
        undone.
      </>
    );
  }

  const parts: string[] = [];
  if (systems > 0) {
    parts.push(
      `mapped to ${systems} system${systems === 1 ? "" : "s"}`
    );
  }
  if (products > 0) {
    parts.push(
      `linked to ${products} product${products === 1 ? "" : "s"}`
    );
  }

  return (
    <>
      This capability is {parts.join(" and ")}. Deleting it will remove those relationships. This
      cannot be undone.
    </>
  );
}
