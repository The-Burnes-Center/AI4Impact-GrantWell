import json
from decimal import Decimal

import pytest

from conftest import FUNCTIONS, SHARED_LAYER, create_table, http_event, load_handler


@pytest.fixture
def drafts(aws, monkeypatch):
    monkeypatch.setenv("DRAFT_TABLE_NAME", "drafts")
    monkeypatch.setenv("DRAFT_VERSION_TABLE_NAME", "draft-versions")
    table = create_table("drafts", "user_id", "session_id", indexes=[("LastModifiedIndex", "user_id", "last_modified")])
    versions = create_table("draft-versions", "draft_key", "rev", range_type="N")
    module = load_handler(FUNCTIONS / "draft-editor" / "lambda_function.py", "draft_editor", [SHARED_LAYER])
    module.test_table, module.test_versions = table, versions
    return module


def call(drafts, body, sub="user-1"):
    res = drafts.lambda_handler(http_event(body, sub=sub, **{"custom:state": "MA"}), None)
    return res["statusCode"], json.loads(res["body"]) if isinstance(res.get("body"), str) else res.get("body")


def create(drafts, sub="user-1", session_id="d1"):
    status, body = call(drafts, {"operation": "add_draft", "session_id": session_id, "title": " Bridge ", "document_identifier": "Grant A"}, sub)
    assert status == 200
    return body


def test_a_new_draft_starts_at_rev_1_on_project_basics(drafts):
    body = create(drafts)

    assert (body["rev"], body["status"], body["title"]) == (1, "project_basics", "Bridge")


def test_a_save_with_the_current_rev_bumps_it(drafts):
    create(drafts)

    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"Summary": "Text"}, "expected_rev": 1})

    assert status == 200
    assert (body["rev"], body["sections"]) == (2, {"Summary": "Text"})


def test_a_stale_save_is_a_409_carrying_the_current_draft_and_writes_nothing(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"Summary": "From tab A"}, "expected_rev": 1})

    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"Summary": "From tab B"}, "expected_rev": 1})

    assert status == 409
    assert body["error"] == "conflict"
    assert body["current"]["sections"] == {"Summary": "From tab A"}
    stored = drafts.test_table.get_item(Key={"user_id": "user-1", "session_id": "d1"})["Item"]
    assert (stored["sections"], stored["rev"]) == ({"Summary": "From tab A"}, Decimal(2))


def test_another_user_cannot_read_or_overwrite_a_draft(drafts):
    create(drafts, sub="owner")

    status, body = call(drafts, {"operation": "get_draft", "session_id": "d1", "user_id": "owner"}, sub="intruder")
    assert (status, body) == (200, {})

    call(drafts, {"operation": "update_draft", "session_id": "d1", "user_id": "owner", "title": "pwned"}, sub="intruder")
    assert drafts.test_table.get_item(Key={"user_id": "owner", "session_id": "d1"})["Item"]["title"] == "Bridge"


def test_deleting_a_draft_also_deletes_its_version_history(drafts):
    create(drafts)
    for rev in (1, 2, 3):
        drafts.test_versions.put_item(Item={"draft_key": "user-1#d1", "rev": rev})
    drafts.test_versions.put_item(Item={"draft_key": "user-2#d1", "rev": 1})

    status, body = call(drafts, {"operation": "delete_draft", "session_id": "d1"})

    assert (status, body["deleted"]) == (200, True)
    assert drafts.test_table.scan()["Items"] == []
    assert [i["draft_key"] for i in drafts.test_versions.scan()["Items"]] == ["user-2#d1"]


def test_marking_a_step_leaves_rev_alone_so_the_next_save_does_not_conflict(drafts):
    create(drafts)

    status, _ = call(drafts, {"operation": "mark_step_reached", "session_id": "d1", "reached_step": "questionnaire"})
    assert status == 200

    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "title": "Still mine", "expected_rev": 1})
    assert (status, body["reachedSteps"]) == (200, ["questionnaire"])


def test_marking_a_step_on_a_missing_draft_is_404(drafts):
    status, _ = call(drafts, {"operation": "mark_step_reached", "session_id": "nope", "reached_step": "questionnaire"})

    assert status == 404


def test_an_unknown_status_is_rejected_before_any_write(drafts):
    create(drafts)

    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "status": "approved"})

    assert status == 400
    assert body["error"] == "Validation error"
