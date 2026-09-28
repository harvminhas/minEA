import unittest

from fastapi import HTTPException

from app.services.cost_lines import apply_cost_lines


def line(**overrides):
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "type": "subscription",
        "amount_cents": 1800000,
        "frequency": "annual",
        "calculation": {"kind": "flat"},
        "vendor": "IBM",
        "source": "invoice",
        "created_at": "2026-09-28T00:00:00Z",
        "created_by": "user",
        "updated_at": "2026-09-28T00:00:00Z",
        "updated_by": "user",
    }
    base.update(overrides)
    return base


class CostLineWriteBackTests(unittest.TestCase):
    def test_untouched_without_lines(self) -> None:
        props = {"annual_cost": 1200, "vendor": "IBM"}
        self.assertEqual(apply_cost_lines("application", props), props)

    def test_application_writes_number_and_drops_internal(self) -> None:
        props = {
            "annual_cost": 1,
            "cost_lines": [
                line(),
                line(
                    type="internal_estimate",
                    amount_cents=4500000,
                    vendor=None,
                    source="estimate",
                ),
            ],
        }
        saved = apply_cost_lines("application", props)
        self.assertEqual(saved["annual_cost"], 18000)
        self.assertEqual(len(saved["cost_lines"]), 2)

    def test_platform_writes_string(self) -> None:
        saved = apply_cost_lines("cloud_service", {"cost_lines": [line(amount_cents=144000)]})
        self.assertEqual(saved["annual_cost"], "1440")

    def test_zero_run_removes_annual_cost(self) -> None:
        saved = apply_cost_lines(
            "application",
            {
                "annual_cost": 500,
                "cost_lines": [
                    line(type="services_one_time", frequency="one_time", one_time_date="2026-03-01")
                ],
            },
        )
        self.assertNotIn("annual_cost", saved)

    def test_internal_with_vendor_is_rejected(self) -> None:
        with self.assertRaises(HTTPException):
            apply_cost_lines(
                "application",
                {"cost_lines": [line(type="internal_estimate", vendor="IBM")]},
            )


if __name__ == "__main__":
    unittest.main()
