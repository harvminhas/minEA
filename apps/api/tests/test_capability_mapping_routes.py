import unittest


class CapabilityMappingRouteTests(unittest.TestCase):
    def test_process_and_contact_link_routes_are_registered(self):
        from app.main import app

        paths = {getattr(route, "path", "") for route in app.routes}
        methods_by_path: dict[str, set[str]] = {}
        for route in app.routes:
            path = getattr(route, "path", "")
            methods_by_path.setdefault(path, set()).update(getattr(route, "methods", None) or [])

        add_process = "/api/v1/orgs/{org_slug}/workspaces/{workspace_slug}/processes/{process_id}/capabilities"
        remove_process = (
            "/api/v1/orgs/{org_slug}/workspaces/{workspace_slug}/processes/{process_id}/capabilities/{capability_id}"
        )
        add_contact = (
            "/api/v1/orgs/{org_slug}/workspaces/{workspace_slug}/people/contacts/{contact_id}/accountabilities"
        )
        self.assertIn(add_process, paths)
        self.assertIn("POST", methods_by_path[add_process])
        self.assertIn(remove_process, paths)
        self.assertIn("DELETE", methods_by_path[remove_process])
        self.assertIn(add_contact, paths)
        self.assertIn("POST", methods_by_path[add_contact])

    def test_process_capability_add_schema(self):
        from uuid import uuid4
        from app.schemas.processes import ProcessCapabilityAdd

        cap_id = uuid4()
        body = ProcessCapabilityAdd(capability_id=cap_id)
        self.assertEqual(body.capability_id, cap_id)
