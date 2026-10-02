import unittest

from app.services.catalog_document import pack_catalog, unpack_catalog


class CatalogDocumentTests(unittest.TestCase):
    def test_small_estate_is_one_document(self) -> None:
        packed = pack_catalog(
            [{"id": "a", "name": "Order Entry"}],
            [{"id": "r", "type": "runs_on"}],
            version=3,
            built_at="2026-10-02T00:00:00+00:00",
        )
        self.assertEqual(packed["manifest"]["partIds"], [])
        self.assertEqual(packed["parts"], [])
        unpacked = unpack_catalog(packed["manifest"], packed["parts"])
        self.assertEqual(unpacked["objects"][0]["name"], "Order Entry")
        self.assertEqual(unpacked["version"], 3)

    def test_large_estate_splits_and_round_trips(self) -> None:
        objects = [{"id": str(i), "blob": "x" * 20_000} for i in range(80)]
        packed = pack_catalog(objects, [{"id": "edge"}], version=1, built_at=None)
        self.assertGreater(len(packed["parts"]), 1)
        unpacked = unpack_catalog(packed["manifest"], packed["parts"])
        self.assertEqual(len(unpacked["objects"]), 80)
        self.assertEqual(unpacked["relationships"][0]["id"], "edge")


if __name__ == "__main__":
    unittest.main()
