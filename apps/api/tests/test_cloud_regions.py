"""Clouds & tenants: providers, built-in regions, region keys, migration 051 and admin services."""
import asyncio
import json
import os
import re
import uuid
from pathlib import Path

import pytest

from app.schemas.relationships import RelationshipCreate, merge_attributes
from app.services import cloud_regions as cr
from app.services.infra_fields import CLOUD_PROVIDERS, validate_infra_patch

API = Path(cr.__file__).resolve().parent.parent
WEB_COPY = API.parent.parent / "web" / "lib" / "hosting" / "cloud-regions.json"
MIGRATION = API.parent / "migrations" / "051_cloud_regions.sql"


def test_web_copy_is_identical():
    if not WEB_COPY.exists():
        pytest.skip("web app not checked out")
    assert json.loads(WEB_COPY.read_text(encoding="utf-8")) == cr.CATALOG


def test_fixed_providers_and_real_region_lists():
    assert cr.PROVIDER_IDS == ("azure", "aws", "gcp", "m365", "google_workspace", "salesforce", "other")
    assert set(cr.PROVIDER_IDS) == CLOUD_PROVIDERS
    assert cr.STANDARD["azure:canadacentral"]["name"] == "Canada Central"
    assert cr.STANDARD["aws:ca-central-1"]["note"] == "Canada (Central)"
    assert cr.STANDARD["gcp:northamerica-northeast1"]["note"] == "Montréal"
    assert cr.STANDARD["m365:canada"]["name"] == "Canada"
    keys = list(cr.STANDARD)
    assert len(keys) == len(set(keys))
    assert all(cr.KEY_RE.match(k) for k in keys)


def test_standard_match_is_per_provider_and_case_insensitive():
    assert cr.standard_match("azure", " canada  CENTRAL ") == "azure:canadacentral"
    assert cr.standard_match("azure", "canadacentral") == "azure:canadacentral"
    assert cr.standard_match("aws", "Canada (Central)") == "aws:ca-central-1"
    assert cr.standard_match("m365", "EU") == "m365:european-union"
    assert cr.standard_match("m365", "Canada Central") is None
    assert cr.standard_match("other", "Canada") is None


@pytest.mark.parametrize("props,name,expected", cr.CATALOG["provider_cases"])
def test_tenant_provider_rules(props, name, expected):
    assert cr.tenant_provider(props, name) == expected


def test_migration_aliases_come_from_the_json():
    sql = MIGRATION.read_text(encoding="utf-8")
    rows = set(re.findall(r"\('([a-z0-9_]+)', '([^']+)', '((?:[^']|'')*)'\)", sql))
    expected = {(pid, r["key"], a.lower().replace("'", "''")) for pid, regions in cr.CATALOG["regions"].items() for r in regions for a in (r["name"], *r["aliases"])}
    assert rows == expected
    assert "DROP " not in sql.upper().replace("ON COMMIT DROP", "")
    assert "attributes - 'region'" not in sql, "051 must keep the old text"


def test_migration_is_registered():
    src = (API.parent / "scripts" / "migrate.py").read_text(encoding="utf-8")
    assert '"051_cloud_regions.sql"' in src


def _link(**attributes):
    return RelationshipCreate(type="runs_on", from_object_id=uuid.uuid4(), from_type="application", to_object_id=uuid.uuid4(), to_type="cloud_service", attributes=attributes)


def test_links_reference_regions_by_key():
    assert _link(region_key="azure:canadacentral").attributes == {"region_key": "azure:canadacentral"}
    assert _link(region_key=f"custom:{uuid.uuid4()}")
    for bad in ("azure:mars", "Canada Central", 5, "custom:nope"):
        with pytest.raises(ValueError):
            _link(region_key=bad)
    assert _link(region="Canada Central").attributes == {"region": "Canada Central"}, "old links still validate"


def test_setting_a_key_replaces_the_old_text():
    assert merge_attributes("runs_on", {"region": "Canada Central"}, {"region_key": "azure:canadacentral"}) == {"region_key": "azure:canadacentral"}
    assert merge_attributes("runs_on", {"region_key": "azure:canadacentral"}, {"region_key": None}) == {}


def test_tenant_properties_validate_provider_and_regions_used():
    validate_infra_patch("cloud_service", {"cloud_provider": "m365", "regions_used": ["azure:canadacentral"]})
    with pytest.raises(ValueError):
        validate_infra_patch("cloud_service", {"cloud_provider": "mars"})
    with pytest.raises(ValueError):
        validate_infra_patch("cloud_service", {"regions_used": ["Canada"]})


def test_tenant_patch_and_merge_fill():
    props = cr.tenant_patch({"vendor": "microsoft", "tenant_id": "old"}, {"provider": "azure", "tenant_id": " 7f3c ", "annual_cost": "", "regions_used": ["azure:canadacentral", "azure:canadacentral"]})
    assert props == {"vendor": "microsoft", "cloud_provider": "azure", "tenant_id": "7f3c", "regions_used": ["azure:canadacentral"]}
    with pytest.raises(ValueError):
        cr.tenant_patch({}, {"provider": "mars"})
    merged = cr.merged_tenant_properties({"tenant_id": "", "regions_used": ["azure:canadaeast"]}, [{"tenant_id": "abc", "annual_cost": "1200", "regions_used": ["azure:canadacentral"]}])
    assert merged == {"tenant_id": "abc", "annual_cost": "1200", "regions_used": ["azure:canadaeast", "azure:canadacentral"]}
    assert cr.duplicate_tenants([{"id": "1", "provider": "azure", "name": "Contoso  prod"}, {"id": "2", "provider": "azure", "name": "contoso prod"}, {"id": "3", "provider": "aws", "name": "Contoso prod"}]) == [["1", "2"]]


class _Result:
    def __init__(self, row=None, scalar=None, rows=None):
        self.row, self.scalar, self.rows = row, scalar, rows or []

    def mappings(self):
        return self

    def first(self):
        return self.row

    def all(self):
        return self.rows

    def scalar_one(self):
        return self.scalar

    def scalar_one_or_none(self):
        return self.scalar


class FakeDb:
    def __init__(self, table=True, existing=None, row=None):
        self.sql, self.table, self.existing, self.row, self.committed = [], table, existing, row, False

    async def execute(self, stmt, params=None):
        sql = str(stmt)
        self.sql.append((sql, params or {}))
        if "to_regclass" in sql:
            return _Result(scalar=self.table)
        if sql.startswith("SELECT id FROM cloud_regions"):
            return _Result(scalar=self.existing)
        if sql.startswith("SELECT * FROM cloud_regions"):
            return _Result(row=self.row)
        if "RETURNING id" in sql:
            return _Result(scalar=uuid.uuid4())
        return _Result()

    async def commit(self):
        self.committed = True


WS, ORG = uuid.uuid4(), uuid.uuid4()


def test_custom_region_add_prefers_builtin_then_reuses_then_creates():
    db = FakeDb()
    assert asyncio.run(cr.create_custom(db, WS, ORG, None, "azure", "canada central")) == {"key": "azure:canadacentral", "name": "Canada Central", "created": False}
    assert not any("INSERT" in s for s, _ in db.sql)
    found = str(uuid.uuid4())
    assert asyncio.run(cr.create_custom(FakeDb(existing=found), WS, ORG, None, "aws", "Lab"))["key"] == f"custom:{found}"
    made = asyncio.run(cr.create_custom(db, WS, ORG, None, "aws", "  Lab   B "))
    assert made["created"] and made["name"] == "Lab B" and made["key"].startswith("custom:")
    with pytest.raises(ValueError):
        asyncio.run(cr.create_custom(db, WS, ORG, None, "mars", "x"))
    with pytest.raises(RuntimeError):
        asyncio.run(cr.create_custom(FakeDb(table=False), WS, ORG, None, "aws", "Lab"))


def test_region_merge_stays_within_one_provider_and_moves_links():
    src = str(uuid.uuid4())
    db = FakeDb(row={"id": src, "provider": "azure", "name": "Canada Centrl"})
    assert asyncio.run(cr.merge_custom(db, WS, "azure:canadacentral", [src])) == 1
    moved = [p for s, p in db.sql if s.startswith("UPDATE relationships")]
    assert moved[0]["old"] == f"custom:{src}" and moved[0]["new"] == "azure:canadacentral"
    assert any(s.startswith("DELETE FROM cloud_regions") for s, _ in db.sql) and db.committed
    with pytest.raises(ValueError):
        asyncio.run(cr.merge_custom(FakeDb(row={"id": src, "provider": "aws", "name": "x"}), WS, "azure:canadacentral", [src]))


def test_deleting_a_custom_region_clears_it_from_links():
    src = str(uuid.uuid4())
    db = FakeDb(row={"id": src, "provider": "aws", "name": "Lab"})
    asyncio.run(cr.delete_custom(db, WS, src))
    assert any("attributes - 'region_key' - 'region'" in s for s, _ in db.sql)


PG = os.environ.get("BUBO_PG_TEST_DSN")


@pytest.mark.skipif(not PG, reason="set BUBO_PG_TEST_DSN to a THROWAWAY Postgres to run 051 for real")
def test_migration_051_on_a_scratch_database():
    import asyncpg

    async def run():
        c = await asyncpg.connect(PG)
        await c.execute("DROP SCHEMA IF EXISTS m051 CASCADE; CREATE SCHEMA m051; SET search_path = m051;"
                        "CREATE TABLE orgs (id uuid primary key); CREATE TABLE users (id uuid primary key);"
                        "CREATE TABLE workspaces (id uuid primary key, org_id uuid, catalog_dirty boolean default false);"
                        "CREATE TABLE objects (id uuid primary key, workspace_id uuid, type text, name text, properties jsonb default '{}');"
                        "CREATE TABLE relationships (id uuid primary key, workspace_id uuid, org_id uuid, type text, from_object_id uuid, to_object_id uuid, attributes jsonb default '{}');")
        org, ws, app = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        prod, m365 = uuid.uuid4(), uuid.uuid4()
        await c.execute("INSERT INTO orgs VALUES ($1)", org)
        await c.execute("INSERT INTO workspaces VALUES ($1, $2)", ws, org)
        await c.execute("INSERT INTO objects VALUES ($1,$2,'cloud_service','Contoso Azure prod','{\"cloud_provider\":\"azure\"}'), ($3,$2,'cloud_service','M365','{\"vendor\":\"microsoft\",\"platform_kind\":\"saas_suite\"}'), ($4,$2,'application','App','{}')", prod, ws, m365, app)
        rels = [(uuid.uuid4(), prod, "canada CENTRAL"), (uuid.uuid4(), m365, "Canada Central")]
        for rid, to, region in rels:
            await c.execute("INSERT INTO relationships VALUES ($1,$2,$3,'runs_on',$4,$5,$6)", rid, ws, org, app, to, json.dumps({"region": region}))
        sql = MIGRATION.read_text(encoding="utf-8").replace("REFERENCES workspaces", "REFERENCES m051.workspaces")
        for _ in range(2):
            await c.execute(sql)
        got = {r["id"]: json.loads(r["attributes"]) for r in await c.fetch("SELECT id, attributes FROM relationships")}
        assert got[rels[0][0]] == {"region": "canada CENTRAL", "region_key": "azure:canadacentral"}
        assert got[rels[1][0]]["region_key"].startswith("custom:") and got[rels[1][0]]["region"] == "Canada Central"
        assert await c.fetchval("SELECT count(*) FROM cloud_regions") == 1
        await c.execute("DROP SCHEMA m051 CASCADE")
        await c.close()

    asyncio.run(run())
