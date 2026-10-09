import json
from datetime import datetime, timezone

import pytest
from botocore.stub import Stubber

from conftest import FUNCTIONS, load_handler

RUNNING = ["IN_PROGRESS"]
STARTING = ["STARTING"]


@pytest.fixture
def kb(monkeypatch):
    monkeypatch.setenv("KB_ID", "kb-1")
    monkeypatch.setenv("SOURCE", "ds-nofo")
    monkeypatch.setenv("USER_DOCUMENTS_SOURCE", "ds-user")
    module = load_handler(FUNCTIONS / "knowledge-management" / "kb-sync" / "lambda_function.py", "kb_sync")
    with Stubber(module.client) as stub:
        module.stub = stub
        yield module
        stub.assert_no_pending_responses()


def jobs(stub, source, *, running=False, statuses=(RUNNING, STARTING)):
    """check_running asks once for IN_PROGRESS and once for STARTING jobs."""
    for values in statuses:
        summaries = [{
            "knowledgeBaseId": "kb-1", "dataSourceId": source, "ingestionJobId": "j",
            "status": values[0], "startedAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc),
        }] if running and values == RUNNING else []
        stub.add_response(
            "list_ingestion_jobs",
            {"ingestionJobSummaries": summaries},
            {"dataSourceId": source, "knowledgeBaseId": "kb-1",
             "filters": [{"attribute": "STATUS", "operator": "EQ", "values": values}]},
        )


def start(stub, source):
    stub.add_response(
        "start_ingestion_job",
        {"ingestionJob": {"knowledgeBaseId": "kb-1", "dataSourceId": source, "ingestionJobId": "new", "status": "STARTING",
                          "startedAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc)}},
        {"dataSourceId": source, "knowledgeBaseId": "kb-1"},
    )


def http(path, roles):
    claims = {"sub": "u1"}
    if roles is not None:
        claims["custom:role"] = json.dumps(roles)
    return {"rawPath": path, "requestContext": {"authorizer": {"jwt": {"claims": claims}}}}


def test_a_targeted_sync_starts_only_that_source(kb):
    jobs(kb.stub, "ds-nofo")
    start(kb.stub, "ds-nofo")

    kb.lambda_handler({"syncSource": "nofo"}, None)


def test_a_targeted_sync_does_not_start_while_one_is_running(kb, capsys):
    jobs(kb.stub, "ds-user", running=True)

    kb.lambda_handler({"syncSource": "user-documents"}, None)

    assert "already in progress" in capsys.readouterr().out


def test_a_job_started_by_someone_else_in_between_is_skipped_not_an_error(kb, capsys):
    jobs(kb.stub, "ds-nofo")
    kb.stub.add_client_error("start_ingestion_job", service_error_code="ConflictException", http_status_code=409)

    kb.lambda_handler({"syncSource": "nofo"}, None)

    assert "Skipped NOFO bucket sync" in capsys.readouterr().out


def test_a_full_sync_starts_both_sources_even_if_the_first_conflicts(kb):
    jobs(kb.stub, "ds-nofo")
    jobs(kb.stub, "ds-user")
    kb.stub.add_client_error("start_ingestion_job", service_error_code="ConflictException", http_status_code=409)
    start(kb.stub, "ds-nofo")

    kb.lambda_handler({}, None)


def test_an_admin_sees_whether_a_sync_is_running(kb):
    jobs(kb.stub, "ds-nofo", running=True)
    jobs(kb.stub, "ds-user")

    res = kb.lambda_handler(http("/kb-sync/still-syncing", ["Admin"]), None)

    assert (res["statusCode"], json.loads(res["body"])) == (200, "STILL SYNCING")


@pytest.mark.parametrize("roles", [["User"], None], ids=["plain user", "no role attribute"])
def test_any_signed_in_user_sees_whether_a_sync_is_running(kb, roles):
    jobs(kb.stub, "ds-nofo")
    jobs(kb.stub, "ds-user")

    res = kb.lambda_handler(http("/kb-sync/still-syncing", roles), None)

    assert (res["statusCode"], json.loads(res["body"])) == (200, "DONE SYNCING")


def test_the_last_sync_time_stays_admin_only(kb):
    res = kb.lambda_handler(http("/kb-sync/get-last-sync", ["User"]), None)

    assert res["statusCode"] == 403


def test_the_last_sync_is_the_newest_completed_job_across_both_sources(kb):
    def completed(source, when):
        kb.stub.add_response(
            "list_ingestion_jobs",
            {"ingestionJobSummaries": [{"knowledgeBaseId": "kb-1", "dataSourceId": source, "ingestionJobId": "j",
                                        "status": "COMPLETE", "startedAt": when, "updatedAt": when}]},
            {"dataSourceId": source, "knowledgeBaseId": "kb-1",
             "filters": [{"attribute": "STATUS", "operator": "EQ", "values": ["COMPLETE"]}]},
        )

    completed("ds-nofo", datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc))
    completed("ds-user", datetime(2026, 10, 8, 14, 30, tzinfo=timezone.utc))

    res = kb.lambda_handler(http("/kb-sync/get-last-sync", ["Developer"]), None)

    assert json.loads(res["body"]) == "October 08, 2026, 02:30PM UTC"
