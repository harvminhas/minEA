"""Validate properties.cost_lines and write annual_cost back from the vendor run total."""

from __future__ import annotations

from fastapi import HTTPException, status

NUMBER_TYPES = {"application", "solution", "technical_capability"}
LINE_TYPES = {
    "subscription",
    "support_maintenance",
    "hosting",
    "services_one_time",
    "internal_estimate",
    "other",
}
FREQUENCIES = {"monthly", "annual", "one_time"}
SOURCES = {"estimate", "quote", "invoice"}


def _fail(message: str) -> None:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


def line_annual_cents(line: dict) -> int:
    calc = line.get("calculation") or {}
    kind = calc.get("kind")
    if kind == "per_user":
        return int(calc["seats"]) * int(calc["unit_price_monthly_cents"]) * 12
    if kind == "pct_of_license":
        return round(int(calc["license_amount_cents"]) * int(calc["pct_bp"]) / 10000)
    amount = int(line.get("amount_cents") or 0)
    if line.get("frequency") == "monthly":
        return amount * 12
    if line.get("frequency") == "one_time":
        return 0
    return amount


def _validate_line(line: object) -> dict:
    if not isinstance(line, dict):
        _fail("Each cost line must be an object.")
    if line.get("type") not in LINE_TYPES:
        _fail("Choose a cost type.")
    if line.get("frequency") not in FREQUENCIES:
        _fail("Choose how often this cost repeats.")
    if line.get("source") not in SOURCES:
        _fail("Choose a source: estimate, quote, or invoice.")
    calc = line.get("calculation")
    if not isinstance(calc, dict) or calc.get("kind") not in {"flat", "per_user", "pct_of_license"}:
        _fail("Choose a calculation.")
    kind = calc["kind"]
    frequency = line["frequency"]
    if line["type"] == "services_one_time" and (frequency != "one_time" or kind != "flat"):
        _fail("Services are one-time. Use Other for recurring services.")
    if line["type"] == "internal_estimate" and (line["source"] != "estimate" or line.get("vendor")):
        _fail("Internal time is an estimate and has no vendor.")
    if kind in {"per_user", "pct_of_license"} and frequency == "one_time":
        _fail("Seats and a percentage apply to recurring cost.")
    if kind == "flat" and line.get("amount_cents") is None:
        _fail("Enter an amount first")
    if frequency == "one_time" and not line.get("one_time_date"):
        _fail("When was (or is) it paid?")
    if kind == "per_user" and (int(calc.get("seats") or 0) < 1 or calc.get("unit_price_monthly_cents") is None):
        _fail("Seats and price per user per month are required.")
    if kind == "pct_of_license" and (not calc.get("pct_bp") or calc.get("license_amount_cents") is None):
        _fail("Percentage and licence amount are required.")
    if line.get("ai_feature") is not None and not isinstance(line.get("ai_feature"), str):
        _fail("ai_feature must be the AI feature's key.")
    return line


def run_cents(lines: list[dict]) -> int:
    total = 0
    for line in lines:
        if line.get("type") == "internal_estimate" or line.get("frequency") == "one_time":
            continue
        total += line_annual_cents(line)
    return total


def parse_legacy_annual_cost(value: object) -> float | None:
    """Same rules as parseLegacyAnnualCost: a number or digit string above zero."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    if isinstance(value, str):
        cleaned = value.replace("$", "").replace(",", "").replace(" ", "")
        if not cleaned or any(ch.isalpha() for ch in cleaned):
            return None
        try:
            number = float(cleaned)
        except ValueError:
            return None
        return number if number > 0 else None
    return None


def object_annual_dollars(properties: dict | None) -> float | None:
    """Vendor run total when cost lines exist, otherwise the legacy annual_cost."""
    props = properties or {}
    raw = props.get("cost_lines")
    if isinstance(raw, list) and raw:
        dollars = run_cents([line for line in raw if isinstance(line, dict)]) / 100
        return dollars if dollars > 0 else None
    return parse_legacy_annual_cost(props.get("annual_cost"))


def apply_cost_lines(object_type: str, properties: dict) -> dict:
    """When cost_lines is present, validate it and set annual_cost to the vendor run total."""
    if "cost_lines" not in properties:
        return properties
    raw = properties.get("cost_lines")
    if raw is None:
        properties.pop("cost_lines", None)
        return properties
    if not isinstance(raw, list):
        _fail("Cost lines must be a list.")
    lines = [_validate_line(line) for line in raw]
    properties["cost_lines"] = lines
    dollars = run_cents(lines) / 100
    if dollars <= 0:
        properties.pop("annual_cost", None)
        return properties
    if object_type in NUMBER_TYPES:
        properties["annual_cost"] = int(dollars) if dollars == int(dollars) else dollars
    else:
        properties["annual_cost"] = str(int(dollars)) if dollars == int(dollars) else str(dollars)
    return properties
