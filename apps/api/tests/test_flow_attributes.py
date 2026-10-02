import unittest

from app.schemas.relationships import validate_flow_attributes


class FlowAttributeTests(unittest.TestCase):
    def test_bad_enum_is_rejected(self):
        with self.assertRaises(ValueError):
            validate_flow_attributes("sends_data_to", {"how": "carrier pigeon"})
        with self.assertRaises(ValueError):
            validate_flow_attributes("sends_data_to", {"frequency": "weekly"})

    def test_known_values_pass(self):
        validate_flow_attributes("sends_data_to", {"what": "Orders", "how": "api", "frequency": "realtime"})
        validate_flow_attributes("runs_on", {"how": "nope"})


if __name__ == "__main__":
    unittest.main()
