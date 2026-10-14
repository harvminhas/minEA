-- Clouds & tenants: org custom regions + region references on app -> tenant links.
-- Additive only (dev and prod share one DB):
--   * new table cloud_regions (custom regions per provider, per workspace like People & teams);
--   * runs_on / built_on links to a platform (cloud_service) that carry the old free-text
--     attributes.region get attributes.region_key added. attributes.region is KEPT, so code from
--     before this change still reads the same text. Re-running is a no-op (only links without a
--     region_key are touched; custom regions are reused by name).
-- Standard names/aliases below are generated from app/data/cloud_regions.json (test_cloud_regions
-- checks they agree). Unmatched text becomes a custom region under the tenant's provider.
CREATE TABLE IF NOT EXISTS cloud_regions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL,
    name         TEXT NOT NULL,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cloud_regions_name ON cloud_regions (workspace_id, provider, lower(name));

CREATE TEMP TABLE _std_region_alias (provider TEXT, key TEXT, alias TEXT) ON COMMIT DROP;
INSERT INTO _std_region_alias (provider, key, alias) VALUES
    ('azure', 'azure:canadacentral', 'canada central'),
    ('azure', 'azure:canadacentral', 'canadacentral'),
    ('azure', 'azure:canadacentral', 'azure canada central'),
    ('azure', 'azure:canadaeast', 'canada east'),
    ('azure', 'azure:canadaeast', 'canadaeast'),
    ('azure', 'azure:canadaeast', 'azure canada east'),
    ('azure', 'azure:eastus', 'east us'),
    ('azure', 'azure:eastus', 'eastus'),
    ('azure', 'azure:eastus', 'azure east us'),
    ('azure', 'azure:eastus2', 'east us 2'),
    ('azure', 'azure:eastus2', 'eastus2'),
    ('azure', 'azure:eastus2', 'azure east us 2'),
    ('azure', 'azure:centralus', 'central us'),
    ('azure', 'azure:centralus', 'centralus'),
    ('azure', 'azure:centralus', 'azure central us'),
    ('azure', 'azure:northcentralus', 'north central us'),
    ('azure', 'azure:northcentralus', 'northcentralus'),
    ('azure', 'azure:northcentralus', 'azure north central us'),
    ('azure', 'azure:southcentralus', 'south central us'),
    ('azure', 'azure:southcentralus', 'southcentralus'),
    ('azure', 'azure:southcentralus', 'azure south central us'),
    ('azure', 'azure:westcentralus', 'west central us'),
    ('azure', 'azure:westcentralus', 'westcentralus'),
    ('azure', 'azure:westcentralus', 'azure west central us'),
    ('azure', 'azure:westus', 'west us'),
    ('azure', 'azure:westus', 'westus'),
    ('azure', 'azure:westus', 'azure west us'),
    ('azure', 'azure:westus2', 'west us 2'),
    ('azure', 'azure:westus2', 'westus2'),
    ('azure', 'azure:westus2', 'azure west us 2'),
    ('azure', 'azure:westus3', 'west us 3'),
    ('azure', 'azure:westus3', 'westus3'),
    ('azure', 'azure:westus3', 'azure west us 3'),
    ('azure', 'azure:northeurope', 'north europe'),
    ('azure', 'azure:northeurope', 'northeurope'),
    ('azure', 'azure:northeurope', 'azure north europe'),
    ('azure', 'azure:westeurope', 'west europe'),
    ('azure', 'azure:westeurope', 'westeurope'),
    ('azure', 'azure:westeurope', 'azure west europe'),
    ('azure', 'azure:uksouth', 'uk south'),
    ('azure', 'azure:uksouth', 'uksouth'),
    ('azure', 'azure:uksouth', 'azure uk south'),
    ('azure', 'azure:ukwest', 'uk west'),
    ('azure', 'azure:ukwest', 'ukwest'),
    ('azure', 'azure:ukwest', 'azure uk west'),
    ('azure', 'azure:francecentral', 'france central'),
    ('azure', 'azure:francecentral', 'francecentral'),
    ('azure', 'azure:francecentral', 'azure france central'),
    ('azure', 'azure:germanywestcentral', 'germany west central'),
    ('azure', 'azure:germanywestcentral', 'germanywestcentral'),
    ('azure', 'azure:germanywestcentral', 'azure germany west central'),
    ('azure', 'azure:swedencentral', 'sweden central'),
    ('azure', 'azure:swedencentral', 'swedencentral'),
    ('azure', 'azure:swedencentral', 'azure sweden central'),
    ('azure', 'azure:switzerlandnorth', 'switzerland north'),
    ('azure', 'azure:switzerlandnorth', 'switzerlandnorth'),
    ('azure', 'azure:switzerlandnorth', 'azure switzerland north'),
    ('azure', 'azure:norwayeast', 'norway east'),
    ('azure', 'azure:norwayeast', 'norwayeast'),
    ('azure', 'azure:norwayeast', 'azure norway east'),
    ('azure', 'azure:australiaeast', 'australia east'),
    ('azure', 'azure:australiaeast', 'australiaeast'),
    ('azure', 'azure:australiaeast', 'azure australia east'),
    ('azure', 'azure:australiasoutheast', 'australia southeast'),
    ('azure', 'azure:australiasoutheast', 'australiasoutheast'),
    ('azure', 'azure:australiasoutheast', 'azure australia southeast'),
    ('azure', 'azure:japaneast', 'japan east'),
    ('azure', 'azure:japaneast', 'japaneast'),
    ('azure', 'azure:japaneast', 'azure japan east'),
    ('azure', 'azure:koreacentral', 'korea central'),
    ('azure', 'azure:koreacentral', 'koreacentral'),
    ('azure', 'azure:koreacentral', 'azure korea central'),
    ('azure', 'azure:southeastasia', 'southeast asia'),
    ('azure', 'azure:southeastasia', 'southeastasia'),
    ('azure', 'azure:southeastasia', 'azure southeast asia'),
    ('azure', 'azure:eastasia', 'east asia'),
    ('azure', 'azure:eastasia', 'eastasia'),
    ('azure', 'azure:eastasia', 'azure east asia'),
    ('azure', 'azure:centralindia', 'central india'),
    ('azure', 'azure:centralindia', 'centralindia'),
    ('azure', 'azure:centralindia', 'azure central india'),
    ('azure', 'azure:brazilsouth', 'brazil south'),
    ('azure', 'azure:brazilsouth', 'brazilsouth'),
    ('azure', 'azure:brazilsouth', 'azure brazil south'),
    ('azure', 'azure:southafricanorth', 'south africa north'),
    ('azure', 'azure:southafricanorth', 'southafricanorth'),
    ('azure', 'azure:southafricanorth', 'azure south africa north'),
    ('azure', 'azure:uaenorth', 'uae north'),
    ('azure', 'azure:uaenorth', 'uaenorth'),
    ('azure', 'azure:uaenorth', 'azure uae north'),
    ('aws', 'aws:ca-central-1', 'ca-central-1'),
    ('aws', 'aws:ca-central-1', 'canada (central)'),
    ('aws', 'aws:ca-central-1', 'aws ca-central-1'),
    ('aws', 'aws:ca-west-1', 'ca-west-1'),
    ('aws', 'aws:ca-west-1', 'canada west (calgary)'),
    ('aws', 'aws:ca-west-1', 'aws ca-west-1'),
    ('aws', 'aws:us-east-1', 'us-east-1'),
    ('aws', 'aws:us-east-1', 'us east (n. virginia)'),
    ('aws', 'aws:us-east-1', 'aws us-east-1'),
    ('aws', 'aws:us-east-2', 'us-east-2'),
    ('aws', 'aws:us-east-2', 'us east (ohio)'),
    ('aws', 'aws:us-east-2', 'aws us-east-2'),
    ('aws', 'aws:us-west-1', 'us-west-1'),
    ('aws', 'aws:us-west-1', 'us west (n. california)'),
    ('aws', 'aws:us-west-1', 'aws us-west-1'),
    ('aws', 'aws:us-west-2', 'us-west-2'),
    ('aws', 'aws:us-west-2', 'us west (oregon)'),
    ('aws', 'aws:us-west-2', 'aws us-west-2'),
    ('aws', 'aws:eu-west-1', 'eu-west-1'),
    ('aws', 'aws:eu-west-1', 'europe (ireland)'),
    ('aws', 'aws:eu-west-1', 'aws eu-west-1'),
    ('aws', 'aws:eu-west-2', 'eu-west-2'),
    ('aws', 'aws:eu-west-2', 'europe (london)'),
    ('aws', 'aws:eu-west-2', 'aws eu-west-2'),
    ('aws', 'aws:eu-west-3', 'eu-west-3'),
    ('aws', 'aws:eu-west-3', 'europe (paris)'),
    ('aws', 'aws:eu-west-3', 'aws eu-west-3'),
    ('aws', 'aws:eu-central-1', 'eu-central-1'),
    ('aws', 'aws:eu-central-1', 'europe (frankfurt)'),
    ('aws', 'aws:eu-central-1', 'aws eu-central-1'),
    ('aws', 'aws:eu-north-1', 'eu-north-1'),
    ('aws', 'aws:eu-north-1', 'europe (stockholm)'),
    ('aws', 'aws:eu-north-1', 'aws eu-north-1'),
    ('aws', 'aws:ap-southeast-1', 'ap-southeast-1'),
    ('aws', 'aws:ap-southeast-1', 'asia pacific (singapore)'),
    ('aws', 'aws:ap-southeast-1', 'aws ap-southeast-1'),
    ('aws', 'aws:ap-southeast-2', 'ap-southeast-2'),
    ('aws', 'aws:ap-southeast-2', 'asia pacific (sydney)'),
    ('aws', 'aws:ap-southeast-2', 'aws ap-southeast-2'),
    ('aws', 'aws:ap-northeast-1', 'ap-northeast-1'),
    ('aws', 'aws:ap-northeast-1', 'asia pacific (tokyo)'),
    ('aws', 'aws:ap-northeast-1', 'aws ap-northeast-1'),
    ('aws', 'aws:ap-south-1', 'ap-south-1'),
    ('aws', 'aws:ap-south-1', 'asia pacific (mumbai)'),
    ('aws', 'aws:ap-south-1', 'aws ap-south-1'),
    ('aws', 'aws:sa-east-1', 'sa-east-1'),
    ('aws', 'aws:sa-east-1', 'south america (são paulo)'),
    ('aws', 'aws:sa-east-1', 'aws sa-east-1'),
    ('gcp', 'gcp:northamerica-northeast1', 'northamerica-northeast1'),
    ('gcp', 'gcp:northamerica-northeast1', 'montréal'),
    ('gcp', 'gcp:northamerica-northeast2', 'northamerica-northeast2'),
    ('gcp', 'gcp:northamerica-northeast2', 'toronto'),
    ('gcp', 'gcp:us-central1', 'us-central1'),
    ('gcp', 'gcp:us-central1', 'iowa'),
    ('gcp', 'gcp:us-east1', 'us-east1'),
    ('gcp', 'gcp:us-east1', 'south carolina'),
    ('gcp', 'gcp:us-east4', 'us-east4'),
    ('gcp', 'gcp:us-east4', 'northern virginia'),
    ('gcp', 'gcp:us-west1', 'us-west1'),
    ('gcp', 'gcp:us-west1', 'oregon'),
    ('gcp', 'gcp:europe-west1', 'europe-west1'),
    ('gcp', 'gcp:europe-west1', 'belgium'),
    ('gcp', 'gcp:europe-west2', 'europe-west2'),
    ('gcp', 'gcp:europe-west2', 'london'),
    ('gcp', 'gcp:europe-west3', 'europe-west3'),
    ('gcp', 'gcp:europe-west3', 'frankfurt'),
    ('gcp', 'gcp:europe-west4', 'europe-west4'),
    ('gcp', 'gcp:europe-west4', 'netherlands'),
    ('gcp', 'gcp:asia-northeast1', 'asia-northeast1'),
    ('gcp', 'gcp:asia-northeast1', 'tokyo'),
    ('gcp', 'gcp:asia-southeast1', 'asia-southeast1'),
    ('gcp', 'gcp:asia-southeast1', 'singapore'),
    ('gcp', 'gcp:australia-southeast1', 'australia-southeast1'),
    ('gcp', 'gcp:australia-southeast1', 'sydney'),
    ('gcp', 'gcp:southamerica-east1', 'southamerica-east1'),
    ('gcp', 'gcp:southamerica-east1', 'são paulo'),
    ('m365', 'm365:canada', 'canada'),
    ('m365', 'm365:united-states', 'united states'),
    ('m365', 'm365:united-states', 'us'),
    ('m365', 'm365:united-states', 'usa'),
    ('m365', 'm365:european-union', 'european union'),
    ('m365', 'm365:european-union', 'eu'),
    ('m365', 'm365:european-union', 'europe'),
    ('m365', 'm365:united-kingdom', 'united kingdom'),
    ('m365', 'm365:united-kingdom', 'uk'),
    ('m365', 'm365:australia', 'australia'),
    ('m365', 'm365:asia-pacific', 'asia pacific'),
    ('m365', 'm365:asia-pacific', 'apc'),
    ('m365', 'm365:brazil', 'brazil'),
    ('m365', 'm365:france', 'france'),
    ('m365', 'm365:germany', 'germany'),
    ('m365', 'm365:india', 'india'),
    ('m365', 'm365:israel', 'israel'),
    ('m365', 'm365:italy', 'italy'),
    ('m365', 'm365:japan', 'japan'),
    ('m365', 'm365:korea', 'korea'),
    ('m365', 'm365:korea', 'south korea'),
    ('m365', 'm365:norway', 'norway'),
    ('m365', 'm365:qatar', 'qatar'),
    ('m365', 'm365:south-africa', 'south africa'),
    ('m365', 'm365:spain', 'spain'),
    ('m365', 'm365:sweden', 'sweden'),
    ('m365', 'm365:switzerland', 'switzerland'),
    ('m365', 'm365:uae', 'united arab emirates'),
    ('m365', 'm365:uae', 'uae'),
    ('google_workspace', 'google_workspace:united-states', 'united states'),
    ('google_workspace', 'google_workspace:united-states', 'us'),
    ('google_workspace', 'google_workspace:europe', 'europe'),
    ('google_workspace', 'google_workspace:europe', 'eu'),
    ('salesforce', 'salesforce:canada', 'canada'),
    ('salesforce', 'salesforce:united-states', 'united states'),
    ('salesforce', 'salesforce:united-states', 'us'),
    ('salesforce', 'salesforce:germany', 'germany'),
    ('salesforce', 'salesforce:france', 'france'),
    ('salesforce', 'salesforce:united-kingdom', 'united kingdom'),
    ('salesforce', 'salesforce:united-kingdom', 'uk'),
    ('salesforce', 'salesforce:australia', 'australia'),
    ('salesforce', 'salesforce:japan', 'japan'),
    ('salesforce', 'salesforce:india', 'india');

-- Legacy links: the trimmed text and the tenant's provider (same rules as
-- app/services/cloud_regions.tenant_provider and the web's tenantProvider).
CREATE TEMP TABLE _legacy_region_link ON COMMIT DROP AS
SELECT r.id, r.workspace_id, r.org_id, btrim(r.attributes->>'region') AS region,
    CASE
        WHEN o.properties->>'cloud_provider' IN ('azure', 'aws', 'gcp', 'm365', 'google_workspace', 'salesforce', 'other') THEN o.properties->>'cloud_provider'
        WHEN o.name ~* 'azure' THEN 'azure'
        WHEN o.name ~* '\maws\M|amazon web services' THEN 'aws'
        WHEN o.name ~* 'google cloud|\mgcp\M' THEN 'gcp'
        WHEN o.name ~* 'microsoft 365|office 365|\mm365\M|\mo365\M' THEN 'm365'
        WHEN o.name ~* 'google workspace|g suite' THEN 'google_workspace'
        WHEN o.name ~* 'salesforce' THEN 'salesforce'
        WHEN lower(coalesce(o.properties->>'vendor', '')) = 'microsoft' THEN
            CASE WHEN o.properties->>'platform_kind' = 'cloud_account' THEN 'azure' ELSE 'm365' END
        WHEN lower(coalesce(o.properties->>'vendor', '')) IN ('amazon', 'aws') THEN 'aws'
        WHEN lower(coalesce(o.properties->>'vendor', '')) = 'google' THEN
            CASE WHEN o.properties->>'platform_kind' = 'cloud_account' THEN 'gcp' ELSE 'google_workspace' END
        WHEN lower(coalesce(o.properties->>'vendor', '')) = 'salesforce' THEN 'salesforce'
        ELSE 'other'
    END AS provider
FROM relationships r
JOIN objects o ON o.id = r.to_object_id
WHERE r.type IN ('runs_on', 'built_on')
  AND o.type = 'cloud_service'
  AND jsonb_typeof(r.attributes->'region') = 'string'
  AND btrim(r.attributes->>'region') <> ''
  AND NOT (r.attributes ? 'region_key');

-- 1. Standard names and aliases, case-insensitively, within the tenant's provider.
UPDATE relationships r
SET attributes = r.attributes || jsonb_build_object('region_key', s.key)
FROM _legacy_region_link l
JOIN _std_region_alias s ON s.provider = l.provider AND s.alias = lower(l.region)
WHERE r.id = l.id AND NOT (r.attributes ? 'region_key');

-- 2. Anything else: one custom region per workspace, provider and name (reused if it exists).
INSERT INTO cloud_regions (workspace_id, org_id, provider, name)
SELECT DISTINCT ON (l.workspace_id, l.provider, lower(l.region)) l.workspace_id, l.org_id, l.provider, l.region
FROM _legacy_region_link l
JOIN relationships r ON r.id = l.id
WHERE NOT (r.attributes ? 'region_key')
ORDER BY l.workspace_id, l.provider, lower(l.region), l.region
ON CONFLICT (workspace_id, provider, lower(name)) DO NOTHING;

UPDATE relationships r
SET attributes = r.attributes || jsonb_build_object('region_key', 'custom:' || c.id::text)
FROM _legacy_region_link l
JOIN cloud_regions c ON c.workspace_id = l.workspace_id AND c.provider = l.provider AND lower(c.name) = lower(l.region)
WHERE r.id = l.id AND NOT (r.attributes ? 'region_key');

UPDATE workspaces SET catalog_dirty = TRUE
WHERE id IN (SELECT DISTINCT workspace_id FROM _legacy_region_link);
