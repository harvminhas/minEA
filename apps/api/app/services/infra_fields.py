"""Validate infra property keys the panel and tables edit. Other property keys are left alone."""

from __future__ import annotations

import re

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

RUNTIME_ENUMS = {
    "runtime_kind": {
        "physical_server",
        "vm",
        "cloud_service",
        "database",
        "network_device",
        "storage",
        "end_user_device",
    },
    "location": {"office", "data_center", "cloud_region"},
}

PLATFORM_ENUMS = {
    "platform_kind": {"saas_suite", "paas", "cloud_account", "self_hosted"},
    "hosting_model": {"saas", "paas", "self_hosted", "hybrid"},
}

DATES = {"support_ends", "end_of_life", "commitment_ends", "contract_renewal"}
TEXT = {"os_name", "os_version", "notice_period", "vendor", "vendor_product", "runtime_provider"}


CLOUD_PROVIDERS = {"azure", "aws", "gcp", "m365", "google_workspace", "salesforce", "other"}


def validate_infra_patch(object_type: str, patch: dict | None) -> None:
    if not patch or object_type not in {"model", "cloud_service"}:
        return
    if object_type == "cloud_service":
        provider = patch.get("cloud_provider")
        if provider not in (None, "") and provider not in CLOUD_PROVIDERS:
            raise ValueError("Pick a cloud provider from the list.")
        used = patch.get("regions_used")
        if used is not None:
            from app.services.cloud_regions import valid_region_key

            if not isinstance(used, list) or len(used) > 100 or not all(valid_region_key(k) for k in used):
                raise ValueError("regions_used must be a list of region keys.")
    enums = RUNTIME_ENUMS if object_type == "model" else PLATFORM_ENUMS
    allowed = set(enums) | DATES | TEXT
    for key, value in patch.items():
        if key not in allowed:
            continue
        if value is None or value == "":
            continue
        if not isinstance(value, str):
            raise ValueError(f"{key} must be text.")
        if key in DATES:
            if not _DATE.match(value):
                raise ValueError(f"{key} must be a date in YYYY-MM-DD.")
            continue
        options = enums.get(key)
        if options is not None and value not in options:
            # Older servers stored a place name in location. Kind fields stay a fixed list.
            if key in {"location", "hosting_model"}:
                continue
            raise ValueError(f"Pick a {key.replace('_', ' ')} from the list.")
