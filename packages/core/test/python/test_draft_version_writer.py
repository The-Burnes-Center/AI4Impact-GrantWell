from decimal import Decimal

import pytest
from boto3.dynamodb.types import TypeSerializer

from conftest import FUNCTIONS, SHARED_LAYER, create_table, load_handler

MARKER = "draft-version-writer failed on "
_serialize = TypeSerializer().serialize


@pytest.fixture
def writer(aws, monkeypatch):
    monkeypatch.setenv("DRAFT_VERSION_TABLE_NAME", "draft-versions")
    table = create_table("draft-versions", "draft_key", "rev", range_type="N")
    module = load_handler(FUNCTIONS / "draft-version-writer" / "lambda_function.py", "draft_version_writer", [SHARED_LAYER])
    module.test_table = table
    return module


def image(**fields):
    return {k: _serialize(v) for k, v in fields.items()}


def record(event_id, sequence_number, event_name="MODIFY", old=None, new=None):
    stream = {"SequenceNumber": sequence_number}
    if old is not None:
        stream["OldImage"] = image(**old)
    if new is not None:
        stream["NewImage"] = image(**new)
    return {"eventID": event_id, "eventName": event_name, "dynamodb": stream}


def versions(writer, key="user-1#s1"):
    return writer.test_table.query(
        KeyConditionExpression="draft_key = :k", ExpressionAttributeValues={":k": key}
    )["Items"]


def test_a_new_draft_gets_an_initial_snapshot(writer):
    new = {"user_id": "user-1", "session_id": "s1", "rev": 1, "title": "Bridge", "sections": {}}

    result = writer.lambda_handler({"Records": [record("e-1", "100", "INSERT", new=new)]}, None)

    assert result == {"batchItemFailures": []}
    [row] = versions(writer)
    assert row["rev"] == Decimal(1)
    assert row["source"] == "initial"


def test_an_ai_write_is_snapshotted_with_the_sections_it_changed(writer):
    old = {"user_id": "user-1", "session_id": "s1", "rev": 1, "sections": {"Summary": ""}}
    new = {**old, "rev": 2, "sections": {"Summary": "We will repair the bridge."}, "last_write_source": "ai_generated"}

    writer.lambda_handler({"Records": [record("e-1", "100", old=old, new=new)]}, None)

    [row] = versions(writer)
    assert (row["source"], row["changed_sections"], row["total_word_count"]) == ("ai_generated", ["Summary"], Decimal(5))


def test_a_status_only_change_is_not_a_version(writer):
    old = {"user_id": "user-1", "session_id": "s1", "rev": 1, "status": "questionnaire", "sections": {}}
    new = {**old, "status": "editing_sections"}

    writer.lambda_handler({"Records": [record("e-1", "100", old=old, new=new)]}, None)

    assert versions(writer) == []


def test_reports_only_the_failed_records_sequence_number(writer, monkeypatch, capsys):
    real = writer.process

    def process(rec):
        if rec["eventID"] in {"e-1", "e-3"}:
            raise RuntimeError("DynamoDB unavailable")
        return real(rec)

    monkeypatch.setattr(writer, "process", process)
    records = [record("e-1", "100"), record("e-2", "200"), record("e-3", "300")]

    result = writer.lambda_handler({"Records": records}, None)

    assert result == {"batchItemFailures": [{"itemIdentifier": "100"}, {"itemIdentifier": "300"}]}
    assert capsys.readouterr().out.startswith(f"{MARKER}e-1: DynamoDB unavailable")


def test_a_real_dynamodb_failure_logs_the_alarm_marker(writer, capsys):
    writer.test_table.delete()
    new = {"user_id": "user-1", "session_id": "s1", "rev": 1, "sections": {}}

    result = writer.lambda_handler({"Records": [record("e-9", "900", "INSERT", new=new)]}, None)

    assert result == {"batchItemFailures": [{"itemIdentifier": "900"}]}
    assert capsys.readouterr().out.startswith(f"{MARKER}e-9: ")


ORDER = [{"id": "summary", "name": "Summary"}, {"id": "budget", "name": "Budget"}]


def test_converting_a_row_from_section_names_to_ids_is_not_a_new_version(writer):
    old = {"user_id": "user-1", "session_id": "s1", "rev": 4, "sections": {"Summary": "Text", "Budget": ""}}
    new = {**old, "rev": 5, "sections": {"summary": "Text", "budget": ""}, "section_order": ORDER, "last_write_source": "manual"}

    writer.lambda_handler({"Records": [record("e-1", "100", old=old, new=new)]}, None)

    assert versions(writer) == []


def test_changes_across_the_conversion_are_reported_by_section_id(writer):
    old = {"user_id": "user-1", "session_id": "s1", "rev": 4, "sections": {"Summary": "Text"}}
    new = {**old, "rev": 5, "sections": {"summary": "Text", "budget": "New money"}, "section_order": ORDER, "last_write_source": "autosave"}

    writer.lambda_handler({"Records": [record("e-1", "100", old=old, new=new)]}, None)

    [row] = versions(writer)
    assert row["changed_sections"] == ["budget"]
    assert row["section_word_counts"] == {"summary": Decimal(1), "budget": Decimal(2)}


def test_pruning_reads_every_page_of_versions(writer, monkeypatch):
    rows = [{"rev": Decimal(rev)} for rev in range(60, 0, -1)]
    pages = [rows[:20], rows[20:40], rows[40:]]
    calls = []
    deleted = []

    def query(**kwargs):
        calls.append(kwargs)
        page = pages[len(calls) - 1]
        out = {"Items": page}
        if len(calls) < len(pages):
            out["LastEvaluatedKey"] = {"draft_key": "user-1#s1", "rev": page[-1]["rev"]}
        return out

    class Batch:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def delete_item(self, Key):
            deleted.append(int(Key["rev"]))

    monkeypatch.setattr(writer.table, "query", query)
    monkeypatch.setattr(writer.table, "batch_writer", lambda: Batch())

    writer._prune("user-1#s1")

    assert len(calls) == 3
    assert calls[2]["ExclusiveStartKey"]["rev"] == Decimal(21)
    assert deleted == list(range(10, 0, -1))
