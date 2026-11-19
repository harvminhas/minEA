from pathlib import Path

SHARED = Path(__file__).resolve().parents[3] / "packages" / "types" / "src" / "assessment-descriptors.json"
API = Path(__file__).resolve().parents[1] / "app" / "data" / "assessment-descriptors.json"


def test_api_descriptors_match_the_shared_config():
    assert SHARED.read_bytes() == API.read_bytes()
