import unittest

from app.services.add_batch import blank, empty_property_patch


class EmptyFillTests(unittest.TestCase):
    def test_blank(self):
        self.assertTrue(blank(None))
        self.assertTrue(blank(""))
        self.assertTrue(blank("  "))
        self.assertFalse(blank("Tom"))
        self.assertFalse(blank(0))

    def test_patch_skips_filled_fields(self):
        patch = empty_property_patch(
            {"vendor": "HubSpot", "category": "Marketing", "catalog_tool": ""},
            {"vendor": "Other", "category": "Sales", "catalog_tool": "hubspot", "contract_renewal": "2027-01-01"},
        )
        self.assertEqual(patch["catalog_tool"], "hubspot")
        self.assertEqual(patch["contract_renewal"], "2027-01-01")
        self.assertNotIn("vendor", patch)
        self.assertNotIn("category", patch)


if __name__ == "__main__":
    unittest.main()
