import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { architectureRecordCrumbs } from "./architecture-breadcrumb";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("architecture record breadcrumbs", () => {
  it("builds Architecture › Capabilities › Domain › Capability › Activity with links on ancestors", () => {
    const items = architectureRecordCrumbs({
      capabilitiesHref: "/orgs/acme/workspaces/main/model/capabilities",
      domain: { name: "Customer & After-Sales", href: "/orgs/acme/workspaces/main/business/capabilities/domains/d1" },
      capability: { name: "Lead capture", href: "/orgs/acme/workspaces/main/model/capabilities/c1" },
      activity: { name: "Capture enquiries" },
    });
    assert.deepEqual(items.map((item) => item.label), [
      "Architecture",
      "Capabilities",
      "Customer & After-Sales",
      "Lead capture",
      "Capture enquiries",
    ]);
    assert.equal(items[0]?.href, undefined);
    assert.equal(items[1]?.href, "/orgs/acme/workspaces/main/model/capabilities");
    assert.ok(items[2]?.href?.includes("/domains/d1"));
    assert.ok(items[3]?.href?.includes("/capabilities/c1"));
    assert.equal(items[4]?.href, undefined);
  });

  it("capability, activity, and domain tabbed pages reuse the same breadcrumb", () => {
    const view = src("components/capability-map/CapabilityDetailView.tsx");
    const page = src("components/capability-map/CapabilityDetailPage.tsx");
    const domain = src("components/capability-map/DomainDetailPage.tsx");
    assert.match(view, /ArchitectureBreadcrumb/);
    assert.match(view, /architectureRecordCrumbs/);
    assert.match(page, /domainDetailPath/);
    assert.match(domain, /ArchitectureBreadcrumb/);
    assert.match(domain, /architectureRecordCrumbs/);
    assert.doesNotMatch(view, /All domains/);
    assert.doesNotMatch(domain, />Domain</);
  });
});
