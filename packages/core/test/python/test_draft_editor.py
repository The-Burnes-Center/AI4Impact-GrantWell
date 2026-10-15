import json
from decimal import Decimal
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from conftest import FUNCTIONS, SHARED_LAYER, create_table, http_event, load_handler

ORDER = [{"id": "summary", "name": "Summary"}, {"id": "budget", "name": "Budget"}]


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

    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Text"}, "section_order": ORDER, "expected_rev": 1})

    assert status == 200
    assert (body["rev"], body["sections"], body["sectionOrder"]) == (2, {"summary": "Text"}, ORDER)


def test_a_stale_save_is_a_409_carrying_the_current_draft_and_writes_nothing(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "From tab A"}, "section_order": ORDER, "expected_rev": 1})

    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "From tab B"}, "section_order": ORDER, "expected_rev": 1})

    assert status == 409
    assert body["error"] == "conflict"
    assert body["current"]["sections"] == {"summary": "From tab A"}
    stored = drafts.test_table.get_item(Key={"user_id": "user-1", "session_id": "d1"})["Item"]
    assert (stored["sections"], stored["rev"]) == ({"summary": "From tab A"}, Decimal(2))


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


def stored(drafts, session_id="d1", sub="user-1"):
    return drafts.test_table.get_item(Key={"user_id": sub, "session_id": session_id})["Item"]


def put_old_style(drafts, sections, session_id="d1"):
    """A row saved before section ids existed: keyed by name, no section_order."""
    drafts.test_table.put_item(Item={
        "user_id": "user-1", "session_id": session_id, "title": "Old", "document_identifier": "Grant A",
        "sections": sections, "status": "editing_sections", "rev": 5, "last_modified": "2026-01-01T00:00:00+00:00",
    })


def test_a_new_application_is_keyed_by_section_id_from_the_start(drafts):
    create(drafts)

    assert stored(drafts)["section_order"] == []


def test_a_save_without_an_order_maps_section_names_onto_the_ids(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "A"}, "section_order": ORDER})

    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"Summary": "B", "budget": "C"}})

    assert status == 200
    assert body["sections"] == {"summary": "B", "budget": "C"}
    assert stored(drafts)["section_order"] == ORDER


def test_an_old_application_stays_keyed_by_name_until_a_client_sends_an_order(drafts):
    put_old_style(drafts, {"Summary": "Old"})

    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"Summary": "Edited"}})
    assert "section_order" not in stored(drafts)

    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Edited"}, "section_order": ORDER})
    row = stored(drafts)
    assert (row["sections"], row["section_order"]) == ({"summary": "Edited"}, ORDER)


def test_user_saves_record_when_each_section_changed_and_ai_writes_do_not(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Mine", "budget": ""}, "section_order": ORDER, "last_write_source": "autosave"})
    first = dict(stored(drafts)["section_saved_at"])
    assert set(first) == {"summary", "budget"}

    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Mine", "budget": "AI text"}, "section_order": ORDER, "last_write_source": "ai_generated"})
    assert stored(drafts)["section_saved_at"] == first

    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Mine", "budget": "Edited"}, "section_order": ORDER, "last_write_source": "manual"})
    after = stored(drafts)["section_saved_at"]
    assert after["summary"] == first["summary"]
    assert after["budget"] > first["budget"]


def test_a_save_reports_the_stored_size_against_the_limit(drafts):
    create(drafts)

    _, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "x" * 1000}, "section_order": ORDER})

    assert 1000 < body["itemBytes"] < 2000
    assert body["itemLimitBytes"] == 400 * 1024


def test_an_application_over_the_item_limit_is_a_413_with_a_plain_message(drafts, monkeypatch):
    create(drafts)
    too_large = ClientError(
        {"Error": {"Code": "ValidationException", "Message": "Item size to update has exceeded the maximum allowed size"}},
        "UpdateItem",
    )

    def fail(**_):
        raise too_large

    monkeypatch.setattr(drafts.table, "update_item", fail)
    status, body = call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "x"}, "section_order": ORDER})

    assert status == 413
    assert body["error"] == "too_large"
    assert "too large to save" in body["message"]


def version(drafts, rev, content):
    from shared import draft_versions as dv

    drafts.test_versions.put_item(Item=dv.build_version_item("user-1", "d1", rev, content, "2026-10-01T00:00:00+00:00", source="autosave"))


def test_restoring_one_section_from_a_version_saved_before_ids_lands_on_its_id(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Now", "budget": "Now budget"}, "section_order": ORDER})
    version(drafts, 1, {"sections": {"Summary": "Then", "Budget": "Then budget"}})

    status, body = call(drafts, {"operation": "restore_draft_version", "session_id": "d1", "rev": 1, "sections_only": ["summary"]})

    assert status == 200
    assert body["restoredSections"] == ["summary"]
    row = stored(drafts)
    assert row["sections"] == {"summary": "Then", "budget": "Now budget"}
    assert row["section_order"] == ORDER


def test_an_older_client_can_still_restore_a_section_by_name(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Now"}, "section_order": ORDER})
    version(drafts, 1, {"sections": {"summary": "Then"}, "section_order": ORDER})

    status, _ = call(drafts, {"operation": "restore_draft_version", "session_id": "d1", "rev": 1, "sections_only": ["Summary"]})

    assert status == 200
    assert stored(drafts)["sections"]["summary"] == "Then"


def test_a_missing_section_is_named_in_the_refusal(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Now"}, "section_order": ORDER})
    version(drafts, 1, {"sections": {"summary": "Then"}, "section_order": ORDER})

    status, body = call(drafts, {"operation": "restore_draft_version", "session_id": "d1", "rev": 1, "sections_only": ["budget"]})

    assert status == 422
    assert '"Budget"' in body["message"]


def test_restoring_a_whole_old_version_converts_it_to_ids(drafts):
    create(drafts)
    call(drafts, {"operation": "update_draft", "session_id": "d1", "sections": {"summary": "Now"}, "section_order": ORDER})
    version(drafts, 1, {"title": "Bridge", "sections": {"Summary": "Then", "Gone section": "Kept"}})

    status, _ = call(drafts, {"operation": "restore_draft_version", "session_id": "d1", "rev": 1})

    assert status == 200
    row = stored(drafts)
    assert row["sections"] == {"summary": "Then", "gone-section": "Kept"}
    assert [ref["id"] for ref in row["section_order"]] == ["summary", "budget", "gone-section"]


def test_listing_versions_reads_past_a_short_page(drafts, monkeypatch):
    create(drafts)
    pages = [
        {"Items": [{"rev": 9}], "LastEvaluatedKey": {"draft_key": "user-1#d1", "rev": 9}},
        {"Items": [{"rev": 8}, {"rev": 7}]},
    ]
    seen = []

    def query(**kwargs):
        seen.append(kwargs)
        return pages[len(seen) - 1]

    monkeypatch.setattr(drafts._version_table, "query", query)
    status, body = call(drafts, {"operation": "list_draft_versions", "session_id": "d1", "limit": 3})

    assert status == 200
    assert [v["rev"] for v in body["versions"]] == [9, 8, 7]
    assert [q["Limit"] for q in seen] == [3, 2]
    assert seen[1]["ExclusiveStartKey"] == {"draft_key": "user-1#d1", "rev": 9}


FIXTURE = json.loads((Path(__file__).resolve().parents[1] / "fixtures" / "section-ids.json").read_text())


def test_section_ids_slug_the_same_way_as_the_js_and_ui_copies(drafts):
    from shared import draft_sections as ds

    for name, slug in FIXTURE["slugs"]:
        assert ds.section_slug(name) == slug
