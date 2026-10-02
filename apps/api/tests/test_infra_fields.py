import unittest

from app.services.infra_fields import validate_infra_patch


class InfraFieldTests(unittest.TestCase):
    def test_rejects_a_bad_date_and_a_bad_kind(self):
        with self.assertRaises(ValueError):
            validate_infra_patch("model", {"support_ends": "next week"})
        with self.assertRaises(ValueError):
            validate_infra_patch("model", {"runtime_kind": "mainframe"})
        with self.assertRaises(ValueError):
            validate_infra_patch("cloud_service", {"platform_kind": "mystery"})

    def test_accepts_a_real_date_and_leaves_other_keys_alone(self):
        validate_infra_patch("model", {"support_ends": "2026-10-01", "cost_lines": []})
        validate_infra_patch("model", {"location": "Fremont plant"})
        validate_infra_patch("application", {"runtime_kind": "nope"})


if __name__ == "__main__":
    unittest.main()
