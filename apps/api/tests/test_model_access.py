"""An AI model is accessed through a platform or an app (e.g. ChatGPT Enterprise)."""
from app.ai.ask.ai_landscape import ai_landscape
from app.schemas.relationships import triple_allowed
from app.services.relationship_labels import relationship_words


def _obj(id_, type_, name, **props):
    return {"id": id_, "type": type_, "name": name, "status": "active", "properties": props}


def _rel(id_, type_, src, dst):
    return {"id": id_, "type": type_, "from_object_id": src["id"], "to_object_id": dst["id"], "from_type": src["type"], "to_type": dst["type"]}


def test_model_to_app_link_is_allowed_and_worded_accessed_through():
    for target in ("cloud_service", "application", "solution", "technical_capability"):
        assert triple_allowed("runs_on", "ai_model", target)
        words = relationship_words("runs_on", "ai_model", target)
        assert (words.forward, words.reverse) == ("Accessed through", "Provides access to")
    assert not triple_allowed("runs_on", "application", "application")
    assert relationship_words("runs_on", "application", "cloud_service").forward == "Runs on"


def test_app_a_model_is_accessed_through_is_in_the_ai_landscape():
    model = _obj("m", "ai_model", "GPT-4o")
    chatgpt = _obj("cg", "application", "ChatGPT Enterprise", vendor="OpenAI")
    azure = _obj("az", "cloud_service", "Azure OpenAI", platform_type="ai_platform", vendor="Microsoft")
    payroll = _obj("x", "application", "Payroll")
    result = ai_landscape([model, chatgpt, azure, payroll], [_rel("r1", "runs_on", model, chatgpt)])
    by_id = {item["id"]: item for item in result["platforms"]}
    assert by_id["cg"]["kindLabel"] == "Model access"
    assert by_id["cg"]["counted"] is False
    assert [item["name"] for item in by_id["cg"]["usedBy"]] == ["GPT-4o"]
    assert by_id["az"]["kindLabel"] == "AI platform"
    assert "x" not in by_id
