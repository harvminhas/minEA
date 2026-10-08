import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException

from app.models.data_layer import DataLink
from app.models.objects import ChangeLog, MinEAObject
from app.models.people import PeopleAccountability
from app.models.relationships import Relationship
from app.routers.objects import switch_object_type
from app.schemas.objects import TypeSwitchRequest
from app.services.type_switch import (
    SwitchLink,
    plan_type_switch,
    properties_for_type,
    retarget_reference,
    unread_on_platform,
)


def link(link_id: str, rel_type: str, from_type: str, to_type: str, **ends) -> SwitchLink:
    return SwitchLink(
        id=link_id,
        type=rel_type,
        from_object_id=ends.get("from_id", "edi"),
        from_type=from_type,
        to_object_id=ends.get("to_id", "other"),
        to_type=to_type,
    )


class TypeSwitchTests(unittest.TestCase):
    def test_switch_normalizes_properties_for_the_new_type(self):
        application = properties_for_type(
            "application",
            {"platform": {"platform_id": "azure"}, "category": "custom"},
        )
        self.assertNotIn("platform", application)
        self.assertEqual(application["governance_status"], "sanctioned")
        self.assertTrue(application["is_custom_built"])
        self.assertNotIn("category", application)
        platform = properties_for_type("cloud_service", {"platform": {"platform_id": "azure"}, "category": "ERP"})
        self.assertNotIn("platform", platform)
        self.assertEqual(platform["category"], "ERP")

    def test_technical_capability_is_in_the_alias_set_and_a_platform_drops_unread_rows(self):
        row = SimpleNamespace(
            entity_id="obj",
            entity_kind="technical_capability",
            subject_id="team",
            subject_type="team",
            link_kind="stores",
        )
        retarget_reference(row, "obj", "application", "cloud_service")
        self.assertEqual(row.entity_kind, "cloud_service")
        self.assertEqual(row.subject_type, "team")
        self.assertTrue(unread_on_platform("cloud_service", "manages", "people_accountabilities"))
        self.assertTrue(unread_on_platform("cloud_service", "managed_by", "data_links"))
        self.assertFalse(unread_on_platform("cloud_service", "stores", "data_links"))
        self.assertFalse(unread_on_platform("application", "manages", "people_accountabilities"))

    def test_switch_keeps_the_record_and_lists_invalid_links(self):
        planned = plan_type_switch(
            "edi",
            "application",
            "cloud_service",
            [
                link("host", "built_on", "application", "cloud_service", to_id="azure"),
                link("server", "runs_on", "application", "model", to_id="as400"),
                link("vendor", "supplied_by", "application", "external_party", to_id="ms"),
                link("dep", "depends_on", "application", "application", from_id="other", to_id="edi"),
            ],
            {"azure": "Azure", "as400": "AS400", "ms": "Microsoft", "other": "HubSpot"},
        )
        self.assertEqual(planned.object_id, "edi")
        kept = {item.id: item for item in planned.kept}
        self.assertEqual(set(kept), {"server", "vendor"})
        self.assertEqual(kept["server"].type, "runs_on")
        self.assertEqual(kept["server"].from_type, "cloud_service")
        self.assertEqual(kept["vendor"].id, "vendor")
        self.assertEqual([item.id for item in planned.remapped], ["host"])
        self.assertEqual(planned.remapped[0].type, "runs_on")
        self.assertEqual(planned.remapped[0].from_type, "cloud_service")
        self.assertEqual([item.id for item in planned.invalid], ["dep"])
        self.assertEqual(planned.invalid[0].line, "Needed by HubSpot")
        self.assertEqual(planned.merged, [])
        self.assertNotIn("dep", kept)

    def test_a_platform_built_on_by_an_app_lists_that_link(self):
        planned = plan_type_switch(
            "azure",
            "cloud_service",
            "application",
            [link("built", "built_on", "application", "cloud_service", from_id="edi", to_id="azure")],
            {"edi": "EDI"},
        )
        self.assertEqual(planned.object_id, "azure")
        self.assertEqual(planned.kept, [])
        self.assertEqual(planned.remapped, [])
        self.assertEqual([item.id for item in planned.invalid], ["built"])
        self.assertEqual(planned.merged, [])

    def test_sign_in_links_survive_an_app_platform_switch(self):
        planned = plan_type_switch(
            "m365",
            "application",
            "cloud_service",
            [
                link("sso", "authenticates_via", "application", "application", from_id="sf", to_id="m365"),
                link("own", "authenticates_via", "application", "application", from_id="m365", to_id="okta"),
            ],
            {"sf": "Salesforce", "okta": "Okta"},
        )
        kept = {item.id: item for item in planned.kept}
        self.assertEqual(set(kept), {"sso", "own"})
        self.assertEqual(kept["sso"].to_type, "cloud_service")
        self.assertEqual(kept["own"].from_type, "cloud_service")
        self.assertEqual(planned.invalid, [])

    def test_a_duplicate_remap_is_a_merge(self):
        planned = plan_type_switch(
            "edi",
            "application",
            "cloud_service",
            [
                link("host", "built_on", "application", "cloud_service", to_id="azure"),
                link("run", "runs_on", "application", "cloud_service", to_id="azure"),
            ],
            {"azure": "Azure"},
        )
        self.assertEqual([item.id for item in planned.kept], ["run"])
        self.assertEqual(planned.kept[0].type, "runs_on")
        self.assertEqual(planned.remapped, [])
        self.assertEqual([(item.id, item.line) for item in planned.merged], [("host", "merged into Runs on Azure")])
        self.assertEqual(planned.invalid, [])


class _Result:
    def __init__(self, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = list(rows or [])

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _SwitchDb:
    def __init__(self, obj, rels, names, data_links, people, mirrors):
        self.obj = obj
        self.rels = rels
        self.names = names
        self.data_links = data_links
        self.people = people
        self.mirrors = mirrors
        self.deleted = []
        self.added = []
        self.sqls = []
        self.committed = False
        self.dirty = False

    def add(self, row):
        self.added.append(row)

    async def delete(self, row):
        self.deleted.append(row)

    async def flush(self):
        return None

    async def commit(self):
        self.committed = True

    async def refresh(self, row):
        return None

    async def execute(self, stmt, params=None):
        sql = str(stmt).lower()
        self.sqls.append(sql)
        if "catalog_dirty" in sql:
            self.dirty = True
            return _Result()
        if "workspace_snapshot" in sql:
            return _Result(scalar=None)
        if "data_links" in sql:
            return _Result(rows=self.data_links)
        if "people_accountab" in sql:
            return _Result(rows=self.people)
        if "relationships" in sql:
            return _Result(rows=list(self.rels))
        if "objects.name" in sql and "objects.type" not in sql:
            return _Result(rows=self.names)
        if "objects.type in" in sql:
            return _Result(rows=self.mirrors)
        if "from objects" in sql or "objects." in sql:
            return _Result(scalar=self.obj)
        return _Result()


def _object(workspace_id, org_id, object_id, properties):
    now = datetime.now(timezone.utc)
    return MinEAObject(
        id=object_id,
        workspace_id=workspace_id,
        org_id=org_id,
        type="application",
        name="EDI",
        tags=[],
        properties=properties,
        created_at=now,
        updated_at=now,
    )


def _relationship(workspace_id, org_id, rel_id, rel_type, from_id, to_id, to_type="cloud_service"):
    return Relationship(
        id=rel_id,
        workspace_id=workspace_id,
        org_id=org_id,
        type=rel_type,
        from_object_id=from_id,
        from_type="application",
        to_object_id=to_id,
        to_type=to_type,
        attributes={},
        created_at=datetime.now(timezone.utc),
    )


def _ctx(workspace_id, org_id, user_id):
    ctx = SimpleNamespace(workspace=SimpleNamespace(id=workspace_id), org_id=org_id, user_id=user_id)

    async def allow(_db, _permission):
        return None

    ctx.require_permission = allow
    return ctx


class SwitchEndpointTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.workspace_id = uuid4()
        self.org_id = uuid4()
        self.user_id = uuid4()
        self.object_id = uuid4()
        self.azure_id = uuid4()
        self.other_id = uuid4()

    def _db(self, rels):
        mirror_id = uuid4()
        mirror = _object(
            self.workspace_id,
            self.org_id,
            mirror_id,
            {"platform": {"platform_id": str(self.object_id), "platform_name": "EDI"}},
        )
        mirror.name = "Portal"
        data = DataLink(
            workspace_id=self.workspace_id,
            org_id=self.org_id,
            subject_type="application",
            subject_id=self.object_id,
            entity_kind="application",
            entity_id=self.object_id,
            link_kind="stores",
        )
        person = PeopleAccountability(
            workspace_id=self.workspace_id,
            org_id=self.org_id,
            subject_type="team",
            subject_id=uuid4(),
            entity_kind="application",
            entity_id=self.object_id,
            link_kind="manages",
        )
        obj = _object(
            self.workspace_id,
            self.org_id,
            self.object_id,
            {"platform": {"platform_id": str(self.azure_id), "platform_name": "Azure"}, "category": "ERP"},
        )
        return _SwitchDb(
            obj,
            rels,
            [(self.azure_id, "Azure"), (self.other_id, "HubSpot")],
            [data],
            [person],
            [mirror],
        ), data, person, mirror

    async def test_switch_without_confirmation_is_409(self):
        dep = _relationship(
            self.workspace_id, self.org_id, uuid4(), "depends_on", self.other_id, self.object_id, "application"
        )
        dep.from_type = "application"
        dep.to_type = "application"
        db, data, person, mirror = self._db([dep])
        with self.assertRaises(HTTPException) as caught:
            await switch_object_type(
                self.object_id,
                TypeSwitchRequest(type="cloud_service"),
                _ctx(self.workspace_id, self.org_id, self.user_id),
                db,
            )
        self.assertEqual(caught.exception.status_code, 409)
        self.assertIn("HubSpot", caught.exception.detail["invalid"][0]["line"])
        self.assertEqual(db.deleted, [])
        self.assertFalse(db.committed)
        self.assertFalse(db.dirty)
        self.assertEqual(data.entity_kind, "application")
        self.assertEqual(person.entity_kind, "application")
        self.assertIn("platform", mirror.properties)

    async def test_confirmed_switch_deletes_logs_and_dirties_the_catalog(self):
        dep_id = uuid4()
        dep = _relationship(
            self.workspace_id, self.org_id, dep_id, "depends_on", self.other_id, self.object_id, "application"
        )
        dep.from_type = "application"
        dep.to_type = "application"
        db, data, person, mirror = self._db([dep])
        with patch("app.services.snapshot_hooks.schedule_snapshot_rebuild"):
            saved = await switch_object_type(
                self.object_id,
                TypeSwitchRequest(type="cloud_service", drop_relationship_ids=[dep_id]),
                _ctx(self.workspace_id, self.org_id, self.user_id),
                db,
            )
        self.assertEqual(saved.object.type, "cloud_service")
        self.assertEqual(saved.removed_relationship_ids, [dep_id])
        self.assertIn(dep_id, [row.id for row in db.deleted])
        self.assertIn(person.id, [row.id for row in db.deleted])
        self.assertTrue(db.dirty)
        self.assertTrue(any("catalog_dirty" in sql for sql in db.sqls))
        deleted = next(row for row in db.added if isinstance(row, ChangeLog) and row.action == "relationship_deleted")
        self.assertEqual(deleted.diff["relationship"]["id"], str(dep_id))
        self.assertEqual(deleted.diff["relationship"]["type"], "depends_on")
        self.assertEqual(deleted.diff["relationship"]["from_object_id"], str(self.other_id))
        self.assertEqual(deleted.diff["relationship"]["to_object_id"], str(self.object_id))
        self.assertEqual(deleted.diff["relationship"]["from_type"], "application")
        self.assertNotIn("platform", db.obj.properties)
        self.assertEqual(data.entity_kind, "cloud_service")
        self.assertEqual(data.subject_type, "cloud_service")
        self.assertEqual(person.entity_kind, "application")
        removed = next(row for row in db.added if isinstance(row, ChangeLog) and row.action == "reference_removed")
        self.assertEqual(removed.diff["table"], "people_accountabilities")
        self.assertEqual(removed.diff["row"]["link_kind"], "manages")
        self.assertEqual(removed.diff["row"]["id"], str(person.id))
        retargeted = next(row for row in db.added if isinstance(row, ChangeLog) and row.action == "reference_retargeted")
        self.assertEqual(retargeted.diff["table"], "data_links")
        self.assertEqual(retargeted.diff["after"]["entity_kind"], "cloud_service")
        cleared = next(row for row in db.added if isinstance(row, ChangeLog) and row.action == "platform_mirror_cleared")
        self.assertEqual(cleared.diff["object_id"], str(mirror.id))
        self.assertEqual(cleared.diff["platform"]["platform_id"], str(self.object_id))
        self.assertNotIn("platform", mirror.properties)

    async def test_duplicate_remap_merges_instead_of_listing_a_removal(self):
        host_id = uuid4()
        run_id = uuid4()
        host = _relationship(self.workspace_id, self.org_id, host_id, "built_on", self.object_id, self.azure_id)
        run = _relationship(self.workspace_id, self.org_id, run_id, "runs_on", self.object_id, self.azure_id)
        db, _data, _person, _mirror = self._db([host, run])
        ctx = _ctx(self.workspace_id, self.org_id, self.user_id)
        with self.assertRaises(HTTPException) as caught:
            await switch_object_type(self.object_id, TypeSwitchRequest(type="cloud_service"), ctx, db)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(caught.exception.detail["invalid"], [{"id": str(host_id), "line": "merged into Runs on Azure"}])
        self.assertEqual(db.deleted, [])
        with patch("app.services.snapshot_hooks.schedule_snapshot_rebuild"):
            saved = await switch_object_type(
                self.object_id,
                TypeSwitchRequest(type="cloud_service", drop_relationship_ids=[host_id]),
                ctx,
                db,
            )
        self.assertEqual(saved.removed_relationship_ids, [host_id])
        self.assertIn(host_id, [row.id for row in db.deleted])
        self.assertEqual(run.type, "runs_on")
        self.assertEqual(run.from_type, "cloud_service")
        self.assertEqual(host.type, "built_on")
        self.assertTrue(db.dirty)
        deleted = next(row for row in db.added if isinstance(row, ChangeLog) and row.action == "relationship_deleted")
        self.assertEqual(deleted.diff["merged_into"], "merged into Runs on Azure")
        self.assertEqual(deleted.diff["relationship"]["id"], str(host_id))
        self.assertEqual(deleted.diff["relationship"]["type"], "built_on")
        updated = next(row for row in db.added if isinstance(row, ChangeLog) and row.action == "relationship_updated")
        self.assertEqual(updated.diff["before"]["type"], "runs_on")
        self.assertEqual(updated.diff["after"]["type"], "runs_on")
        self.assertEqual(updated.diff["before"]["from_type"], "application")
        self.assertEqual(updated.diff["after"]["from_type"], "cloud_service")
        self.assertEqual(updated.diff["before"]["id"], str(run_id))
        self.assertFalse(any(row.action == "relationship_remapped" for row in db.added if isinstance(row, ChangeLog)))
